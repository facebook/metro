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
  ModuleData,
  Options,
  TransformInputOptions,
} from './types.flow';

import {buildSubgraph} from './buildSubgraph';
import {fileMatchesContext} from '../lib/contextModule';
import CountingSet from '../lib/CountingSet';

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
type Delta<T> = $ReadOnly<{
  // `added` and `deleted` are mutually exclusive.
  // Internally, a module can be in both `touched` and (either) `added` or
  // `deleted`. Before returning the result, we'll calculate
  // modified = touched - added - deleted.
  added: Set<string>,
  touched: Set<string>,
  deleted: Set<string>,

  moduleData: Map<string, ModuleData<T>>,
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

function isWeakOrLazy<T>(
  dependency: Dependency,
  options: InternalOptions<T>,
): boolean {
  const asyncType = dependency.data.data.asyncType;
  return asyncType === 'weak' || (asyncType != null && options.lazy);
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
    const internalOptions = getInternalOptions(options);

    const modifiedPathsInBaseGraph = paths.filter(path =>
      this.dependencies.has(path),
    );

    const allModifiedPaths = new Set(paths);

    const moduleData = await buildSubgraph(
      new Set(modifiedPathsInBaseGraph),
      this.#resolvedContexts,
      {
        resolve: options.resolve,
        transform: async (absolutePath, requireContext) => {
          internalOptions.onDependencyAdd();
          const result = await options.transform(absolutePath, requireContext);
          internalOptions.onDependencyAdded();
          return result;
        },
        shouldTraverse: (dependency: Dependency) => {
          if (
            // Don't traverse into any path that hasn't been modified and as is
            // already in the graph.
            this.dependencies.has(dependency.absolutePath) &&
            !allModifiedPaths.has(dependency.absolutePath)
          ) {
            return false;
          }
          return !options.shallow && !isWeakOrLazy(dependency, internalOptions);
        },
      },
    );

    const delta = {
      added: new Set<string>(),
      touched: new Set<string>(),
      deleted: new Set<string>(),
      moduleData,
    };

    for (const modified of modifiedPathsInBaseGraph) {
      if (this.dependencies.has(modified)) {
        this._recursivelyCommitModule(modified, delta, internalOptions);
      }
    }

    this._collectCycles(delta, internalOptions);

    const added = new Map<string, Module<T>>();
    for (const path of delta.added) {
      added.set(path, nullthrows(this.dependencies.get(path)));
    }

    const modified = new Map<string, Module<T>>();
    for (const path of modifiedPathsInBaseGraph) {
      if (
        delta.touched.has(path) &&
        !delta.deleted.has(path) &&
        !delta.added.has(path)
      ) {
        modified.set(path, nullthrows(this.dependencies.get(path)));
      }
    }

    return {
      added,
      modified,
      deleted: delta.deleted,
    };
  }

  async initialTraverseDependencies(options: Options<T>): Promise<Result<T>> {
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

    const moduleData = await buildSubgraph(this.entryPoints, new Map(), {
      resolve: options.resolve,
      transform: async (absolutePath, requireContext) => {
        internalOptions.onDependencyAdd();
        const result = await options.transform(absolutePath, requireContext);
        internalOptions.onDependencyAdded();
        return result;
      },
      shouldTraverse: (dependency: Dependency) =>
        !options.shallow && !isWeakOrLazy(dependency, internalOptions),
    });

    const delta = {
      added: new Set<string>(),
      touched: new Set<string>(),
      deleted: new Set<string>(),
      moduleData,
    };

    [...this.entryPoints].forEach((path: string) =>
      this._recursivelyCommitModule(path, delta, internalOptions),
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

  _recursivelyCommitModule(
    path: string,
    delta: Delta<T>,
    options: InternalOptions<T>,
  ): Module<T> {
    // Transform the file via the given option.
    // TODO: Unbind the transform method from options
    const result = nullthrows(delta.moduleData.get(path));

    // Get the absolute path of all sub-dependencies (some of them could have been
    // moved but maintain the same relative path).

    const previousModule = this.dependencies.get(path);
    const previousDependencies = previousModule?.dependencies ?? new Map();
    const {
      dependencies: currentDependencies,
      resolvedContexts,
      ...transformResult
    } = result;

    const nextModule = {
      ...(previousModule ?? {
        inverseDependencies: new CountingSet(),
        path,
      }),
      ...transformResult,
      dependencies: new Map(previousDependencies),
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
    let dependenciesAdded = false;
    for (const [key, curDependency] of currentDependencies) {
      const prevDependency = previousDependencies.get(key);
      if (
        !prevDependency ||
        !dependenciesEqual(prevDependency, curDependency, options)
      ) {
        dependenciesAdded = true;
        this._addDependency(
          nextModule,
          key,
          curDependency,
          resolvedContexts.get(key),
          delta,
          options,
        );
      }
    }

    if (!previousModule) {
      // If the module is not currently in the graph, it is either new or was
      // released earlier in the commit.
      if (delta.deleted.has(path)) {
        // Mark the addition by clearing a prior deletion.
        delta.deleted.delete(path);
      } else {
        // Mark the addition in the added set.
        delta.added.add(path);
      }
    } else if (
      !transformOutputMayDiffer(previousModule, nextModule) &&
      !dependenciesRemoved &&
      !dependenciesAdded
    ) {
      // We have not operated on nextModule, so restore previousModule
      // to aid diffing. Don't add this path to delta.touched.
      this.dependencies.set(previousModule.path, previousModule);
      return previousModule;
    }

    delta.touched.add(path);

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

    nextModule.dependencies = new Map(currentDependencies);

    return nextModule;
  }

  _addDependency(
    parentModule: Module<T>,
    key: string,
    dependency: Dependency,
    requireContext: ?RequireContext,
    delta: Delta<T>,
    options: InternalOptions<T>,
  ): void {
    const path = dependency.absolutePath;

    if (requireContext) {
      this.#resolvedContexts.set(path, requireContext);
    } else {
      // This dependency may have existed previously as a require.context -
      // clean it up.
      this.#resolvedContexts.delete(path);
    }

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
        module = this._recursivelyCommitModule(path, delta, options);
      }

      // We either added a new node to the graph, or we're updating an existing one.
      module.inverseDependencies.add(parentModule.path);
      this._markModuleInUse(module);
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
    delta: Delta<T>,
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
      if (isWeakOrLazy(dependency, options)) {
        continue;
      }
      yield nullthrows(this.dependencies.get(dependency.absolutePath));
    }
  }

  // Delete an unreachable module (and its outbound edges) from the graph
  // immediately.
  // Called when the reference count of a module has reached 0.
  _releaseModule(
    module: Module<T>,
    delta: Delta<T>,
    options: InternalOptions<T>,
  ) {
    if (!delta.moduleData.has(module.path)) {
      // Before releasing a module, take a snapshot of the data we might need
      // to reintroduce it to the graph later in this commit. As it is not
      // already present in moduleData we can infer it has not been modified,
      // so the transform output and dependencies we copy here are current.
      const {dependencies, getSource, output, unstable_transformResultKey} =
        module;

      const resolvedContexts: Map<string, RequireContext> = new Map();
      for (const [key, dependency] of dependencies) {
        const resolvedContext = this.#resolvedContexts.get(
          dependency.absolutePath,
        );
        if (resolvedContext != null) {
          resolvedContexts.set(key, resolvedContext);
        }
      }
      delta.moduleData.set(module.path, {
        dependencies: new Map(dependencies),
        resolvedContexts,
        getSource,
        output,
        unstable_transformResultKey,
      });
    }

    for (const [key, dependency] of module.dependencies) {
      this._removeDependency(module, key, dependency, delta, options);
    }
    this.#gc.color.set(module.path, 'black');
    this._freeModule(module, delta);
  }

  // Delete an unreachable module from the graph.
  _freeModule(module: Module<T>, delta: Delta<T>) {
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
  _collectCycles(delta: Delta<T>, options: InternalOptions<T>) {
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

  _collectWhite(module: Module<T>, delta: Delta<T>) {
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

function transformOutputMayDiffer<T>(a: Module<T>, b: Module<T>): boolean {
  return (
    a.unstable_transformResultKey == null ||
    a.unstable_transformResultKey !== b.unstable_transformResultKey
  );
}
