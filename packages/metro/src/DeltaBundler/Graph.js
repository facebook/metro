/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

/**
 * Portions of this code are based on the Synchronous Cycle Collection
 * algorithm described in:
 *
 * David F. Bacon and V. T. Rajan. 2001. Concurrent Cycle Collection in
 * Reference Counted Systems. In Proceedings of the 15th European Conference on
 * Object-Oriented Programming (ECOOP '01). Springer-Verlag, Berlin,
 * Heidelberg, 207–235.
 *
 * Notable differences from the algorithm in the paper:
 * 1. Our implementation uses the inverseDependencies set (which we already
 *    have to maintain) instead of a separate refcount variable. A module's
 *    reference count is equal to the size of its inverseDependencies set, plus
 *    1 if it's an entry point of the graph.
 * 2. We keep the "root buffer" (possibleCycleRoots) free of duplicates by
 *    making it a Set, instead of storing a "buffered" flag on each node.
 * 3. On top of tracking edges between nodes, we also count references between
 *    nodes and entries in the importBundleNodes set.
 */

import type {RequireContext} from '../lib/contextModule';
import type {RequireContextParams} from '../ModuleGraph/worker/collectDependencies';
import type {
  Dependencies,
  Dependency,
  GraphInputOptions,
  MixedOutput,
  Module,
  Options,
  TransformInputOptions,
  TransformResultDependency,
} from './types.flow';

import {
  deriveAbsolutePathFromContext,
  fileMatchesContext,
} from '../lib/contextModule';
import CountingSet from '../lib/CountingSet';
import * as path from 'path';

const invariant = require('invariant');
const nullthrows = require('nullthrows');

// TODO: Convert to a Flow enum
type NodeColor =
  // In use or free
  | 'black'

  // Possible member of cycle
  | 'gray'

  // Member of garbage cycle
  | 'white'

  // Possible root of cycle
  | 'purple'

  // Inherently acyclic node (Not currently used)
  | 'green';

export type Result<T> = {
  added: Map<string, Module<T>>,
  modified: Map<string, Module<T>>,
  deleted: Set<string>,
};

/**
 * Internal data structure that the traversal logic uses to know which of the
 * files have been modified. This allows to return the added modules before the
 * modified ones (which is useful for things like Hot Module Reloading).
 **/
type Delta = $ReadOnly<{
  // `added` and `deleted` are mutually exclusive.
  // Internally, a module can be in both `modified` and (either) `added` or
  // `deleted`. We fix this up before returning the delta to the client.
  added: Set<string>,
  modified: Set<string>,
  deleted: Set<string>,

  // A place to temporarily track inverse dependencies for a module while it is
  // being processed but has not been added to `graph.dependencies` yet.
  earlyInverseDependencies: Map<string, CountingSet<string>>,
}>;

type InternalOptions<T> = $ReadOnly<{
  lazy: boolean,
  onDependencyAdd: () => mixed,
  onDependencyAdded: () => mixed,
  resolve: Options<T>['resolve'],
  transform: Options<T>['transform'],
  shallow: boolean,
}>;

function getInternalOptions<T>({
  transform,
  resolve,
  onProgress,
  lazy,
  shallow,
}: Options<T>): InternalOptions<T> {
  let numProcessed = 0;
  let total = 0;

  return {
    lazy,
    transform,
    resolve,
    onDependencyAdd: () => onProgress && onProgress(numProcessed, ++total),
    onDependencyAdded: () => onProgress && onProgress(++numProcessed, total),
    shallow,
  };
}

export class Graph<T = MixedOutput> {
  +entryPoints: $ReadOnlySet<string>;
  +transformOptions: TransformInputOptions;
  +dependencies: Dependencies<T> = new Map();
  +#importBundleNodes: Map<
    string,
    $ReadOnly<{
      inverseDependencies: CountingSet<string>,
    }>,
  > = new Map();

  /// GC state for nodes in the graph (this.dependencies)
  +#gc: {
    +color: Map<string, NodeColor>,
    +possibleCycleRoots: Set<string>,
  } = {
    color: new Map(),
    possibleCycleRoots: new Set(),
  };

  /** Resolved context parameters from `require.context`. */
  #resolvedContexts: Map<string, RequireContext> = new Map();

  constructor(options: GraphInputOptions) {
    this.entryPoints = options.entryPoints;
    this.transformOptions = options.transformOptions;
  }

  /**
   * Dependency Traversal logic for the Delta Bundler. This method calculates
   * the modules that should be included in the bundle by traversing the
   * dependency graph.
   * Instead of traversing the whole graph each time, it just calculates the
   * difference between runs by only traversing the added/removed dependencies.
   * To do so, it uses the passed graph dependencies and it mutates it.
   * The paths parameter contains the absolute paths of the root files that the
   * method should traverse. Normally, these paths should be the modified files
   * since the last traversal.
   */
  async traverseDependencies(
    paths: $ReadOnlyArray<string>,
    options: Options<T>,
  ): Promise<Result<T>> {
    const delta = {
      added: new Set<string>(),
      modified: new Set<string>(),
      deleted: new Set<string>(),
      earlyInverseDependencies: new Map<string, CountingSet<string>>(),
    };

    const internalOptions = getInternalOptions(options);

    // Record the paths that are part of the dependency graph before we start
    // traversing - we'll use this to ensure we don't report modules modified
    // that only exist as part of the graph mid-traversal, and to eliminate
    // modules that end up in the same state that they started from the delta.
    const originalModules = new Map<string, Module<T>>();
    for (const path of paths) {
      const originalModule = this.dependencies.get(path);
      if (originalModule) {
        originalModules.set(path, originalModule);
      }
    }

    for (const [path] of originalModules) {
      // Traverse over modules that are part of the dependency graph.
      //
      // Note: A given path may not be part of the graph *at this time*, in
      // particular it may have been removed since we started traversing, but
      // in that case the path will be visited if and when we add it back to
      // the graph in a subsequent iteration.
      if (this.dependencies.has(path)) {
        await this._traverseDependenciesForSingleFile(
          path,
          delta,
          internalOptions,
        );
      }
    }

    this._collectCycles(delta, internalOptions);

    const added = new Map<string, Module<T>>();
    for (const path of delta.added) {
      added.set(path, nullthrows(this.dependencies.get(path)));
    }

    const modified = new Map<string, Module<T>>();

    // A path in delta.modified has been processed during this traversal,
    // but may not actually differ, may be new, or may have been deleted after
    // processing. The actually-modified modules are the intersection of
    // delta.modified with the pre-existing paths, minus modules deleted.
    for (const [path, originalModule] of originalModules) {
      invariant(
        !delta.added.has(path),
        'delta.added has %s, but this path was already in the graph.',
        path,
      );
      if (delta.modified.has(path)) {
        // It's expected that a module may be both modified and subsequently
        // deleted - we'll only return it as deleted.
        if (!delta.deleted.has(path)) {
          // If a module existed before and has not been deleted, it must be
          // in the dependencies map.
          const newModule = nullthrows(this.dependencies.get(path));
          if (
            // Module.dependencies is mutable, so it's not obviously the case
            // that referential equality implies no modification. However, we
            // only mutate dependencies in two cases:
            // 1. Within _processModule. In that case, we always mutate a new
            //    module and set a new reference in this.dependencies.
            // 2. During _releaseModule, when recursively removing
            //    dependencies. In that case, we immediately discard the module
            //    object.
            // TODO: Refactor for more explicit immutability
            newModule !== originalModule ||
            transfromOutputMayDiffer(newModule, originalModule) ||
            // $FlowFixMe[incompatible-call]
            !allDependenciesEqual(newModule, originalModule)
          ) {
            modified.set(path, newModule);
          }
        }
      }
    }

    return {
      added,
      modified,
      deleted: delta.deleted,
    };
  }

  async initialTraverseDependencies(options: Options<T>): Promise<Result<T>> {
    const delta = {
      added: new Set<string>(),
      modified: new Set<string>(),
      deleted: new Set<string>(),
      earlyInverseDependencies: new Map<string, CountingSet<string>>(),
    };

    const internalOptions = getInternalOptions(options);

    invariant(
      this.dependencies.size === 0,
      'initialTraverseDependencies called on nonempty graph',
    );

    this.#gc.color.clear();
    this.#gc.possibleCycleRoots.clear();
    this.#importBundleNodes.clear();

    for (const path of this.entryPoints) {
      // Each entry point implicitly has a refcount of 1, so mark them all black.
      this.#gc.color.set(path, 'black');
    }

    await Promise.all(
      [...this.entryPoints].map((path: string) =>
        this._traverseDependenciesForSingleFile(path, delta, internalOptions),
      ),
    );

    this.reorderGraph({
      shallow: options.shallow,
    });

    return {
      added: this.dependencies,
      modified: new Map(),
      deleted: new Set(),
    };
  }

  async _traverseDependenciesForSingleFile(
    path: string,
    delta: Delta,
    options: InternalOptions<T>,
  ): Promise<void> {
    options.onDependencyAdd();

    await this._processModule(path, delta, options);

    options.onDependencyAdded();
  }

  async _processModule(
    path: string,
    delta: Delta,
    options: InternalOptions<T>,
  ): Promise<Module<T>> {
    const resolvedContext = this.#resolvedContexts.get(path);

    // Transform the file via the given option.
    // TODO: Unbind the transform method from options
    const result = await options.transform(path, resolvedContext);

    // Get the absolute path of all sub-dependencies (some of them could have been
    // moved but maintain the same relative path).
    const currentDependencies = this._resolveDependencies(
      path,
      result.dependencies,
      options,
    );

    const previousModule = this.dependencies.get(path);

    const previousDependencies = previousModule?.dependencies ?? new Map();

    const nextModule = {
      ...(previousModule ?? {
        inverseDependencies:
          delta.earlyInverseDependencies.get(path) ?? new CountingSet(),
        path,
      }),
      dependencies: new Map(previousDependencies),
      getSource: result.getSource,
      output: result.output,
      unstable_transformResultKey: result.unstable_transformResultKey,
    };

    // Update the module information.
    this.dependencies.set(nextModule.path, nextModule);

    // Diff dependencies (1/2): remove dependencies that have changed or been removed.
    let dependenciesRemoved = false;
    for (const [key, prevDependency] of previousDependencies) {
      const curDependency = currentDependencies.get(key);
      if (
        !curDependency ||
        !dependenciesEqual(prevDependency, curDependency, options)
      ) {
        dependenciesRemoved = true;
        this._removeDependency(nextModule, key, prevDependency, delta, options);
      }
    }

    // Diff dependencies (2/2): add dependencies that have changed or been added.
    const addDependencyPromises = [];
    for (const [key, curDependency] of currentDependencies) {
      const prevDependency = previousDependencies.get(key);
      if (
        !prevDependency ||
        !dependenciesEqual(prevDependency, curDependency, options)
      ) {
        addDependencyPromises.push(
          this._addDependency(nextModule, key, curDependency, delta, options),
        );
      }
    }

    if (
      previousModule &&
      !transfromOutputMayDiffer(previousModule, nextModule) &&
      !dependenciesRemoved &&
      addDependencyPromises.length === 0
    ) {
      // We have not operated on nextModule, so restore previousModule
      // to aid diffing.
      this.dependencies.set(previousModule.path, previousModule);
      return previousModule;
    }

    delta.modified.add(path);

    await Promise.all(addDependencyPromises);

    // Replace dependencies with the correctly-ordered version. As long as all
    // the above promises have resolved, this will be the same map but without
    // the added nondeterminism of promise resolution order. Because this
    // assignment does not add or remove edges, it does NOT invalidate any of the
    // garbage collection state.

    // Catch obvious errors with a cheap assertion.
    invariant(
      nextModule.dependencies.size === currentDependencies.size,
      'Failed to add the correct dependencies',
    );

    nextModule.dependencies = currentDependencies;

    return nextModule;
  }

  async _addDependency(
    parentModule: Module<T>,
    key: string,
    dependency: Dependency,
    delta: Delta,
    options: InternalOptions<T>,
  ): Promise<void> {
    const path = dependency.absolutePath;

    // The module may already exist, in which case we just need to update some
    // bookkeeping instead of adding a new node to the graph.
    let module = this.dependencies.get(path);

    if (options.shallow) {
      // Don't add a node for the module if the graph is shallow (single-module).
    } else if (dependency.data.data.asyncType === 'weak') {
      // Exclude weak dependencies from the bundle.
    } else if (options.lazy && dependency.data.data.asyncType != null) {
      // Don't add a node for the module if we are traversing async dependencies
      // lazily (and this is an async dependency). Instead, record it in
      // importBundleNodes.
      this._incrementImportBundleReference(dependency, parentModule);
    } else {
      if (!module) {
        // Add a new node to the graph.
        const earlyInverseDependencies =
          delta.earlyInverseDependencies.get(path);
        if (earlyInverseDependencies) {
          // This module is being transformed at the moment in parallel, so we
          // should only mark its parent as an inverse dependency.
          earlyInverseDependencies.add(parentModule.path);
        } else {
          if (delta.deleted.has(path)) {
            // Mark the addition by clearing a prior deletion.
            delta.deleted.delete(path);
          } else {
            // Mark the addition in the added set.
            delta.added.add(path);
          }
          delta.earlyInverseDependencies.set(path, new CountingSet());

          options.onDependencyAdd();
          module = await this._processModule(path, delta, options);
          options.onDependencyAdded();

          this.dependencies.set(module.path, module);
        }
      }
      if (module) {
        // We either added a new node to the graph, or we're updating an existing one.
        module.inverseDependencies.add(parentModule.path);
        this._markModuleInUse(module);
      }
    }

    // Always update the parent's dependency map.
    // This means the parent's dependencies can get desynced from
    // inverseDependencies and the other fields in the case of lazy edges.
    // Not an optimal representation :(
    parentModule.dependencies.set(key, dependency);
  }

  _removeDependency(
    parentModule: Module<T>,
    key: string,
    dependency: Dependency,
    delta: Delta,
    options: InternalOptions<T>,
  ): void {
    parentModule.dependencies.delete(key);

    const {absolutePath} = dependency;

    if (dependency.data.data.asyncType === 'weak') {
      // Weak dependencies are excluded from the bundle.
      return;
    }

    const module = this.dependencies.get(absolutePath);

    if (options.lazy && dependency.data.data.asyncType != null) {
      this._decrementImportBundleReference(dependency, parentModule);
    } else if (module) {
      // Decrement inverseDependencies only if the dependency is not async,
      // mirroring the increment conditions in _addDependency.
      module.inverseDependencies.delete(parentModule.path);
    }

    if (!module) {
      return;
    }
    if (
      module.inverseDependencies.size > 0 ||
      this.entryPoints.has(absolutePath)
    ) {
      // The reference count has decreased, but not to zero.
      // NOTE: Each entry point implicitly has a refcount of 1.
      this._markAsPossibleCycleRoot(module);
    } else {
      // The reference count has decreased to zero.
      this._releaseModule(module, delta, options);
    }
  }

  /**
   * Collect a list of context modules which include a given file.
   */
  markModifiedContextModules(
    filePath: string,
    modifiedPaths: Set<string> | CountingSet<string>,
  ) {
    for (const [absolutePath, context] of this.#resolvedContexts) {
      if (
        !modifiedPaths.has(absolutePath) &&
        fileMatchesContext(filePath, context)
      ) {
        modifiedPaths.add(absolutePath);
      }
    }
  }

  /**
   * Gets the list of modules affected by the deletion of a given file. The
   * caller is expected to mark these modules as modified in the next call to
   * traverseDependencies. Note that the list may contain duplicates.
   */
  *getModifiedModulesForDeletedPath(filePath: string): Iterable<string> {
    yield* this.dependencies.get(filePath)?.inverseDependencies ?? [];
    yield* this.#importBundleNodes.get(filePath)?.inverseDependencies ?? [];
  }

  _resolveDependencies(
    parentPath: string,
    dependencies: $ReadOnlyArray<TransformResultDependency>,
    options: InternalOptions<T>,
  ): Map<string, Dependency> {
    const maybeResolvedDeps = new Map<
      string,
      void | {absolutePath: string, data: TransformResultDependency},
    >();
    for (const dep of dependencies) {
      let resolvedDep;

      // `require.context`
      const {contextParams} = dep.data;
      if (contextParams) {
        // Ensure the filepath has uniqueness applied to ensure multiple `require.context`
        // statements can be used to target the same file with different properties.
        const from = path.join(parentPath, '..', dep.name);
        const absolutePath = deriveAbsolutePathFromContext(from, contextParams);

        const resolvedContext: RequireContext = {
          from,
          mode: contextParams.mode,
          recursive: contextParams.recursive,
          filter: new RegExp(
            contextParams.filter.pattern,
            contextParams.filter.flags,
          ),
        };

        this.#resolvedContexts.set(absolutePath, resolvedContext);

        resolvedDep = {
          absolutePath,
          data: dep,
        };
      } else {
        try {
          resolvedDep = {
            absolutePath: options.resolve(parentPath, dep).filePath,
            data: dep,
          };

          // This dependency may have existed previously as a require.context -
          // clean it up.
          this.#resolvedContexts.delete(resolvedDep.absolutePath);
        } catch (error) {
          // Ignore unavailable optional dependencies. They are guarded
          // with a try-catch block and will be handled during runtime.
          if (dep.data.isOptional !== true) {
            throw error;
          }
        }
      }

      const key = dep.data.key;
      if (maybeResolvedDeps.has(key)) {
        throw new Error(
          `resolveDependencies: Found duplicate dependency key '${key}' in ${parentPath}`,
        );
      }
      maybeResolvedDeps.set(key, resolvedDep);
    }

    const resolvedDeps = new Map<string, Dependency>();
    // Return just the dependencies we successfully resolved.
    // FIXME: This has a bad bug affecting all dependencies *after* an unresolved
    // optional dependency. We'll need to propagate the nulls all the way to the
    // serializer and the require() runtime to keep the dependency map from being
    // desynced from the contents of the module.
    for (const [key, resolvedDep] of maybeResolvedDeps) {
      if (resolvedDep) {
        resolvedDeps.set(key, resolvedDep);
      }
    }
    return resolvedDeps;
  }

  /**
   * Re-traverse the dependency graph in DFS order to reorder the modules and
   * guarantee the same order between runs. This method mutates the passed graph.
   */
  reorderGraph(options: {shallow: boolean, ...}): void {
    const orderedDependencies = new Map<string, Module<T>>();

    this.entryPoints.forEach((entryPoint: string) => {
      const mainModule = this.dependencies.get(entryPoint);

      if (!mainModule) {
        throw new ReferenceError(
          'Module not registered in graph: ' + entryPoint,
        );
      }

      this._reorderDependencies(mainModule, orderedDependencies, options);
    });
    this.dependencies.clear();
    for (const [key, dep] of orderedDependencies) {
      this.dependencies.set(key, dep);
    }
  }

  _reorderDependencies(
    module: Module<T>,
    orderedDependencies: Map<string, Module<T>>,
    options: {shallow: boolean, ...},
  ): void {
    if (module.path) {
      if (orderedDependencies.has(module.path)) {
        return;
      }

      orderedDependencies.set(module.path, module);
    }

    module.dependencies.forEach((dependency: Dependency) => {
      const path = dependency.absolutePath;
      const childModule = this.dependencies.get(path);

      if (!childModule) {
        if (dependency.data.data.asyncType != null || options.shallow) {
          return;
        } else {
          throw new ReferenceError('Module not registered in graph: ' + path);
        }
      }

      this._reorderDependencies(childModule, orderedDependencies, options);
    });
  }

  /** Garbage collection functions */

  // Add an entry to importBundleNodes (or record an inverse dependency of an existing one)
  _incrementImportBundleReference(
    dependency: Dependency,
    parentModule: Module<T>,
  ) {
    const {absolutePath} = dependency;
    const importBundleNode = this.#importBundleNodes.get(absolutePath) ?? {
      inverseDependencies: new CountingSet(),
    };
    importBundleNode.inverseDependencies.add(parentModule.path);
    this.#importBundleNodes.set(absolutePath, importBundleNode);
  }

  // Decrease the reference count of an entry in importBundleNodes (and delete it if necessary)
  _decrementImportBundleReference(
    dependency: Dependency,
    parentModule: Module<T>,
  ) {
    const {absolutePath} = dependency;

    const importBundleNode = nullthrows(
      this.#importBundleNodes.get(absolutePath),
    );
    invariant(
      importBundleNode.inverseDependencies.has(parentModule.path),
      'lazy: import bundle inverse references',
    );
    importBundleNode.inverseDependencies.delete(parentModule.path);
    if (importBundleNode.inverseDependencies.size === 0) {
      this.#importBundleNodes.delete(absolutePath);
    }
  }

  // Mark a module as in use (ref count >= 1)
  _markModuleInUse(module: Module<T>) {
    this.#gc.color.set(module.path, 'black');
  }

  // Iterate "children" of the given module - i.e. non-weak / async
  // dependencies having a corresponding inverse dependency.
  *_children(
    module: Module<T>,
    options: InternalOptions<T>,
  ): Iterator<Module<T>> {
    for (const dependency of module.dependencies.values()) {
      const asyncType = dependency.data.data.asyncType;
      if (asyncType === 'weak' || (options.lazy && asyncType != null)) {
        continue;
      }
      yield nullthrows(this.dependencies.get(dependency.absolutePath));
    }
  }

  // Delete an unreachable module (and its outbound edges) from the graph
  // immediately.
  // Called when the reference count of a module has reached 0.
  _releaseModule(module: Module<T>, delta: Delta, options: InternalOptions<T>) {
    for (const [key, dependency] of module.dependencies) {
      this._removeDependency(module, key, dependency, delta, options);
    }
    this.#gc.color.set(module.path, 'black');
    this._freeModule(module, delta);
  }

  // Delete an unreachable module from the graph.
  _freeModule(module: Module<T>, delta: Delta) {
    if (delta.added.has(module.path)) {
      // Mark the deletion by clearing a prior addition.
      delta.added.delete(module.path);
    } else {
      // Mark the deletion in the deleted set.
      delta.deleted.add(module.path);
    }

    // This module is not used anywhere else! We can clear it from the bundle.
    // Clean up all the state associated with this module in order to correctly
    // re-add it if we encounter it again.
    this.dependencies.delete(module.path);
    delta.earlyInverseDependencies.delete(module.path);
    this.#gc.possibleCycleRoots.delete(module.path);
    this.#gc.color.delete(module.path);
    this.#resolvedContexts.delete(module.path);
  }

  // Mark a module as a possible cycle root
  _markAsPossibleCycleRoot(module: Module<T>) {
    if (nullthrows(this.#gc.color.get(module.path)) !== 'purple') {
      this.#gc.color.set(module.path, 'purple');
      this.#gc.possibleCycleRoots.add(module.path);
    }
  }

  // Collect any unreachable cycles in the graph.
  _collectCycles(delta: Delta, options: InternalOptions<T>) {
    // Mark recursively from roots (trial deletion)
    for (const path of this.#gc.possibleCycleRoots) {
      const module = nullthrows(this.dependencies.get(path));
      const color = nullthrows(this.#gc.color.get(path));
      if (color === 'purple') {
        this._markGray(module, options);
      } else {
        this.#gc.possibleCycleRoots.delete(path);
        if (
          color === 'black' &&
          module.inverseDependencies.size === 0 &&
          !this.entryPoints.has(path)
        ) {
          this._freeModule(module, delta);
        }
      }
    }
    // Scan recursively from roots (undo unsuccessful trial deletions)
    for (const path of this.#gc.possibleCycleRoots) {
      const module = nullthrows(this.dependencies.get(path));
      this._scan(module, options);
    }
    // Collect recursively from roots (free unreachable cycles)
    for (const path of this.#gc.possibleCycleRoots) {
      this.#gc.possibleCycleRoots.delete(path);
      const module = nullthrows(this.dependencies.get(path));
      this._collectWhite(module, delta);
    }
  }

  _markGray(module: Module<T>, options: InternalOptions<T>) {
    const color = nullthrows(this.#gc.color.get(module.path));
    if (color !== 'gray') {
      this.#gc.color.set(module.path, 'gray');
      for (const childModule of this._children(module, options)) {
        // The inverse dependency will be restored during the scan phase if this module remains live.
        childModule.inverseDependencies.delete(module.path);
        this._markGray(childModule, options);
      }
    }
  }

  _scan(module: Module<T>, options: InternalOptions<T>) {
    const color = nullthrows(this.#gc.color.get(module.path));
    if (color === 'gray') {
      if (
        module.inverseDependencies.size > 0 ||
        this.entryPoints.has(module.path)
      ) {
        this._scanBlack(module, options);
      } else {
        this.#gc.color.set(module.path, 'white');
        for (const childModule of this._children(module, options)) {
          this._scan(childModule, options);
        }
      }
    }
  }

  _scanBlack(module: Module<T>, options: InternalOptions<T>) {
    this.#gc.color.set(module.path, 'black');
    for (const childModule of this._children(module, options)) {
      // The inverse dependency must have been deleted during the mark phase.
      childModule.inverseDependencies.add(module.path);
      const childColor = nullthrows(this.#gc.color.get(childModule.path));
      if (childColor !== 'black') {
        this._scanBlack(childModule, options);
      }
    }
  }

  _collectWhite(module: Module<T>, delta: Delta) {
    const color = nullthrows(this.#gc.color.get(module.path));
    if (color === 'white' && !this.#gc.possibleCycleRoots.has(module.path)) {
      this.#gc.color.set(module.path, 'black');
      for (const dependency of module.dependencies.values()) {
        const childModule = this.dependencies.get(dependency.absolutePath);
        // The child may already have been collected.
        if (childModule) {
          this._collectWhite(childModule, delta);
        }
      }
      this._freeModule(module, delta);
    }
  }

  /** End of garbage collection functions */
}

function dependenciesEqual(
  a: Dependency,
  b: Dependency,
  options: $ReadOnly<{lazy: boolean, ...}>,
): boolean {
  return (
    a === b ||
    (a.absolutePath === b.absolutePath &&
      (!options.lazy || a.data.data.asyncType === b.data.data.asyncType) &&
      contextParamsEqual(a.data.data.contextParams, b.data.data.contextParams))
  );
}

function allDependenciesEqual<T>(
  a: Module<T>,
  b: Module<T>,
  options: $ReadOnly<{lazy: boolean, ...}>,
): boolean {
  if (a.dependencies.size !== b.dependencies.size) {
    return false;
  }
  for (const [key, depA] of a.dependencies) {
    const depB = b.dependencies.get(key);
    if (!depB || !dependenciesEqual(depA, depB, options)) {
      return false;
    }
  }
  return true;
}

function contextParamsEqual(
  a: ?RequireContextParams,
  b: ?RequireContextParams,
): boolean {
  return (
    a === b ||
    (a == null && b == null) ||
    (a != null &&
      b != null &&
      a.recursive === b.recursive &&
      a.filter.pattern === b.filter.pattern &&
      a.filter.flags === b.filter.flags &&
      a.mode === b.mode)
  );
}

function transfromOutputMayDiffer<T>(a: Module<T>, b: Module<T>): boolean {
  return (
    a.unstable_transformResultKey == null ||
    a.unstable_transformResultKey !== b.unstable_transformResultKey
  );
}
