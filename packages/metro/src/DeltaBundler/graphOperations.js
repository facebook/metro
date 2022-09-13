/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
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
 *    nodes and entries in the importBundleNames set.
 */

'use strict';

import type {RequireContextParams} from '../ModuleGraph/worker/collectDependencies';
import type {RequireContext} from '../lib/contextModule';
import type {
  Dependency,
  Graph,
  GraphInputOptions,
  Module,
  Options,
  TransformResultDependency,
} from './types.flow';

import CountingSet from '../lib/CountingSet';
import {
  deriveAbsolutePathFromContext,
  fileMatchesContext,
} from '../lib/contextModule';

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

// Private state for the graph that persists between operations.
export opaque type PrivateState = {
  /** Resolved context parameters from `require.context`. */
  +resolvedContexts: Map<string, RequireContext>,
  +gc: {
    // GC state for nodes in the graph (graph.dependencies)
    +color: Map<string, NodeColor>,
    +possibleCycleRoots: Set<string>,

    // Reference counts for entries in importBundleNames
    +importBundleRefs: Map<string, number>,
  },
};

function createGraph<T>(options: GraphInputOptions): Graph<T> {
  return {
    ...options,
    dependencies: new Map(),
    importBundleNames: new Set(),
    privateState: {
      resolvedContexts: new Map(),
      gc: {
        color: new Map(),
        possibleCycleRoots: new Set(),
        importBundleRefs: new Map(),
      },
    },
  };
}

type Result<T> = {
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
  added: Set<string>,
  modified: Set<string>,
  deleted: Set<string>,

  // A place to temporarily track inverse dependencies for a module while it is
  // being processed but has not been added to `graph.dependencies` yet.
  earlyInverseDependencies: Map<string, CountingSet<string>>,
}>;

type InternalOptions<T> = $ReadOnly<{
  experimentalImportBundleSupport: boolean,
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
  experimentalImportBundleSupport,
  shallow,
}: Options<T>): InternalOptions<T> {
  let numProcessed = 0;
  let total = 0;

  return {
    experimentalImportBundleSupport,
    transform,
    resolve,
    onDependencyAdd: () => onProgress && onProgress(numProcessed, ++total),
    onDependencyAdded: () => onProgress && onProgress(++numProcessed, total),
    shallow,
  };
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
async function traverseDependencies<T>(
  paths: $ReadOnlyArray<string>,
  graph: Graph<T>,
  options: Options<T>,
): Promise<Result<T>> {
  const delta = {
    added: new Set(),
    modified: new Set(),
    deleted: new Set(),
    earlyInverseDependencies: new Map(),
  };

  const internalOptions = getInternalOptions(options);

  for (const path of paths) {
    // Start traversing from modules that are already part of the dependency graph.
    if (graph.dependencies.get(path)) {
      delta.modified.add(path);

      await traverseDependenciesForSingleFile(
        path,
        graph,
        delta,
        internalOptions,
      );
    }
  }

  collectCycles(graph, delta);

  const added = new Map();
  for (const path of delta.added) {
    added.set(path, nullthrows(graph.dependencies.get(path)));
  }

  const modified = new Map();
  for (const path of delta.modified) {
    // Only report a module as modified if we're not already reporting it as added.
    if (!delta.added.has(path)) {
      modified.set(path, nullthrows(graph.dependencies.get(path)));
    }
  }

  return {
    added,
    modified,
    deleted: delta.deleted,
  };
}

async function initialTraverseDependencies<T>(
  graph: Graph<T>,
  options: Options<T>,
): Promise<Result<T>> {
  const delta = {
    added: new Set(),
    modified: new Set(),
    deleted: new Set(),
    earlyInverseDependencies: new Map(),
  };

  const internalOptions = getInternalOptions(options);

  invariant(
    graph.dependencies.size === 0,
    'initialTraverseDependencies called on nonempty graph',
  );
  invariant(
    graph.importBundleNames.size === 0,
    'initialTraverseDependencies called on nonempty graph',
  );

  graph.privateState.gc.color.clear();
  graph.privateState.gc.possibleCycleRoots.clear();
  graph.privateState.gc.importBundleRefs.clear();

  for (const path of graph.entryPoints) {
    // Each entry point implicitly has a refcount of 1, so mark them all black.
    graph.privateState.gc.color.set(path, 'black');
  }

  await Promise.all(
    [...graph.entryPoints].map((path: string) =>
      traverseDependenciesForSingleFile(path, graph, delta, internalOptions),
    ),
  );

  reorderGraph(graph, {
    shallow: options.shallow,
  });

  return {
    added: graph.dependencies,
    modified: new Map(),
    deleted: new Set(),
  };
}

async function traverseDependenciesForSingleFile<T>(
  path: string,
  graph: Graph<T>,
  delta: Delta,
  options: InternalOptions<T>,
): Promise<void> {
  options.onDependencyAdd();

  await processModule(path, graph, delta, options);

  options.onDependencyAdded();
}

async function processModule<T>(
  path: string,
  graph: Graph<T>,
  delta: Delta,
  options: InternalOptions<T>,
): Promise<Module<T>> {
  const resolvedContext = graph.privateState.resolvedContexts.get(path);
  // Transform the file via the given option.
  // TODO: Unbind the transform method from options
  const result = await options.transform(path, resolvedContext);

  // Get the absolute path of all sub-dependencies (some of them could have been
  // moved but maintain the same relative path).
  const currentDependencies = resolveDependencies(
    graph,
    path,
    result.dependencies,
    options,
  );

  const previousModule = graph.dependencies.get(path) || {
    inverseDependencies:
      delta.earlyInverseDependencies.get(path) || new CountingSet(),
    path,
  };
  const previousDependencies = previousModule.dependencies || new Map();

  // Update the module information.
  const module = {
    ...previousModule,
    dependencies: new Map(previousDependencies),
    getSource: result.getSource,
    output: result.output,
  };
  graph.dependencies.set(module.path, module);

  // Diff dependencies (1/2): remove dependencies that have changed or been removed.
  for (const [key, prevDependency] of previousDependencies) {
    const curDependency = currentDependencies.get(key);
    if (
      !curDependency ||
      !dependenciesEqual(prevDependency, curDependency, options)
    ) {
      removeDependency(module, key, prevDependency, graph, delta, options);
    }
  }

  // Diff dependencies (2/2): add dependencies that have changed or been added.
  const promises = [];
  for (const [key, curDependency] of currentDependencies) {
    const prevDependency = previousDependencies.get(key);
    if (
      !prevDependency ||
      !dependenciesEqual(prevDependency, curDependency, options)
    ) {
      promises.push(
        addDependency(module, key, curDependency, graph, delta, options),
      );
    }
  }

  await Promise.all(promises);

  // Replace dependencies with the correctly-ordered version. As long as all
  // the above promises have resolved, this will be the same map but without
  // the added nondeterminism of promise resolution order. Because this
  // assignment does not add or remove edges, it does NOT invalidate any of the
  // garbage collection state.

  // Catch obvious errors with a cheap assertion.
  invariant(
    module.dependencies.size === currentDependencies.size,
    'Failed to add the correct dependencies',
  );

  module.dependencies = currentDependencies;

  return module;
}

function dependenciesEqual(
  a: Dependency,
  b: Dependency,
  options: $ReadOnly<{experimentalImportBundleSupport: boolean, ...}>,
): boolean {
  return (
    a === b ||
    (a.absolutePath === b.absolutePath &&
      (!options.experimentalImportBundleSupport ||
        a.data.data.asyncType === b.data.data.asyncType) &&
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

async function addDependency<T>(
  parentModule: Module<T>,
  key: string,
  dependency: Dependency,
  graph: Graph<T>,
  delta: Delta,
  options: InternalOptions<T>,
): Promise<void> {
  const path = dependency.absolutePath;

  // The module may already exist, in which case we just need to update some
  // bookkeeping instead of adding a new node to the graph.
  let module = graph.dependencies.get(path);

  if (options.shallow) {
    // Don't add a node for the module if the graph is shallow (single-module).
  } else if (
    options.experimentalImportBundleSupport &&
    dependency.data.data.asyncType != null
  ) {
    // Don't add a node for the module if we are traversing async dependencies
    // lazily (and this is an async dependency). Instead, record it in
    // importBundleNames.
    incrementImportBundleReference(dependency, graph);
  } else {
    if (!module) {
      // Add a new node to the graph.
      const earlyInverseDependencies = delta.earlyInverseDependencies.get(path);
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
          delta.modified.delete(path);
        }
        delta.earlyInverseDependencies.set(path, new CountingSet());

        options.onDependencyAdd();
        module = await processModule(path, graph, delta, options);
        options.onDependencyAdded();

        graph.dependencies.set(module.path, module);
      }
    }
    if (module) {
      // We either added a new node to the graph, or we're updating an existing one.
      module.inverseDependencies.add(parentModule.path);
      markModuleInUse(module, graph);
    }
  }

  // Always update the parent's dependency map.
  // This means the parent's dependencies can get desynced from
  // inverseDependencies and the other fields in the case of lazy edges.
  // Not an optimal representation :(
  parentModule.dependencies.set(key, dependency);
}

function removeDependency<T>(
  parentModule: Module<T>,
  key: string,
  dependency: Dependency,
  graph: Graph<T>,
  delta: Delta,
  options: InternalOptions<T>,
): void {
  parentModule.dependencies.delete(key);

  const {absolutePath} = dependency;

  if (
    options.experimentalImportBundleSupport &&
    dependency.data.data.asyncType != null
  ) {
    decrementImportBundleReference(dependency, graph);
  }

  const module = graph.dependencies.get(absolutePath);

  if (!module) {
    return;
  }
  module.inverseDependencies.delete(parentModule.path);
  if (
    module.inverseDependencies.size > 0 ||
    graph.entryPoints.has(absolutePath)
  ) {
    // The reference count has decreased, but not to zero.
    // NOTE: Each entry point implicitly has a refcount of 1.
    markAsPossibleCycleRoot(module, graph);
  } else {
    // The reference count has decreased to zero.
    releaseModule(module, graph, delta, options);
  }
}

/**
 * Collect a list of context modules which include a given file.
 */
function markModifiedContextModules<T>(
  graph: Graph<T>,
  filePath: string,
  modifiedPaths: Set<string>,
) {
  for (const [absolutePath, context] of graph.privateState.resolvedContexts) {
    if (
      !modifiedPaths.has(absolutePath) &&
      fileMatchesContext(filePath, context)
    ) {
      modifiedPaths.add(absolutePath);
    }
  }
}

function resolveDependencies<T>(
  graph: Graph<T>,
  parentPath: string,
  dependencies: $ReadOnlyArray<TransformResultDependency>,
  options: InternalOptions<T>,
): Map<string, Dependency> {
  const maybeResolvedDeps = new Map();
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

      graph.privateState.resolvedContexts.set(absolutePath, resolvedContext);

      resolvedDep = {
        absolutePath,
        data: dep,
      };
    } else {
      try {
        resolvedDep = {
          absolutePath: options.resolve(parentPath, dep.name),
          data: dep,
        };

        // This dependency may have existed previously as a require.context -
        // clean it up.
        graph.privateState.resolvedContexts.delete(resolvedDep.absolutePath);
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

  const resolvedDeps = new Map();
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
function reorderGraph<T>(
  graph: Graph<T>,
  options: {shallow: boolean, ...},
): void {
  const orderedDependencies = new Map();

  graph.entryPoints.forEach((entryPoint: string) => {
    const mainModule = graph.dependencies.get(entryPoint);

    if (!mainModule) {
      throw new ReferenceError('Module not registered in graph: ' + entryPoint);
    }

    reorderDependencies(graph, mainModule, orderedDependencies, options);
  });

  graph.dependencies = orderedDependencies;
}

function reorderDependencies<T>(
  graph: Graph<T>,
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
    const childModule = graph.dependencies.get(path);

    if (!childModule) {
      if (dependency.data.data.asyncType != null || options.shallow) {
        return;
      } else {
        throw new ReferenceError('Module not registered in graph: ' + path);
      }
    }

    reorderDependencies(graph, childModule, orderedDependencies, options);
  });
}

/** Garbage collection functions */

// Add an entry to importBundleNames (or increase the reference count of an existing one)
function incrementImportBundleReference<T>(
  dependency: Dependency,
  graph: Graph<T>,
) {
  const {absolutePath} = dependency;

  graph.privateState.gc.importBundleRefs.set(
    absolutePath,
    (graph.privateState.gc.importBundleRefs.get(absolutePath) ?? 0) + 1,
  );
  graph.importBundleNames.add(absolutePath);
}

// Decrease the reference count of an entry in importBundleNames (and delete it if necessary)
function decrementImportBundleReference<T>(
  dependency: Dependency,
  graph: Graph<T>,
) {
  const {absolutePath} = dependency;

  const prevRefCount = nullthrows(
    graph.privateState.gc.importBundleRefs.get(absolutePath),
  );
  invariant(
    prevRefCount > 0,
    'experimentalImportBundleSupport: import bundle refcount not valid',
  );
  graph.privateState.gc.importBundleRefs.set(absolutePath, prevRefCount - 1);
  if (prevRefCount === 1) {
    graph.privateState.gc.importBundleRefs.delete(absolutePath);
    graph.importBundleNames.delete(absolutePath);
  }
}

// Mark a module as in use (ref count >= 1)
function markModuleInUse<T>(module: Module<T>, graph: Graph<T>) {
  graph.privateState.gc.color.set(module.path, 'black');
}

// Delete an unreachable module from the graph immediately, unless it's queued
// for later deletion as a potential cycle root. Delete the module's outbound
// edges.
// Called when the reference count of a module has reached 0.
function releaseModule<T>(
  module: Module<T>,
  graph: Graph<T>,
  delta: Delta,
  options: InternalOptions<T>,
) {
  for (const [key, dependency] of module.dependencies) {
    removeDependency(module, key, dependency, graph, delta, options);
  }
  graph.privateState.gc.color.set(module.path, 'black');
  if (!graph.privateState.gc.possibleCycleRoots.has(module.path)) {
    freeModule(module, graph, delta);
  }
}

// Delete an unreachable module from the graph.
function freeModule<T>(module: Module<T>, graph: Graph<T>, delta: Delta) {
  if (delta.added.has(module.path)) {
    // Mark the deletion by clearing a prior addition.
    delta.added.delete(module.path);
  } else {
    // Mark the deletion in the deleted set.
    delta.deleted.add(module.path);
    delta.modified.delete(module.path);
  }

  // This module is not used anywhere else! We can clear it from the bundle.
  // Clean up all the state associated with this module in order to correctly
  // re-add it if we encounter it again.
  graph.dependencies.delete(module.path);
  delta.earlyInverseDependencies.delete(module.path);
  graph.privateState.gc.possibleCycleRoots.delete(module.path);
  graph.privateState.gc.color.delete(module.path);
  graph.privateState.resolvedContexts.delete(module.path);
}

// Mark a module as a possible cycle root
function markAsPossibleCycleRoot<T>(module: Module<T>, graph: Graph<T>) {
  if (nullthrows(graph.privateState.gc.color.get(module.path)) !== 'purple') {
    graph.privateState.gc.color.set(module.path, 'purple');
    graph.privateState.gc.possibleCycleRoots.add(module.path);
  }
}

// Collect any unreachable cycles in the graph.
function collectCycles<T>(graph: Graph<T>, delta: Delta) {
  // Mark recursively from roots (trial deletion)
  for (const path of graph.privateState.gc.possibleCycleRoots) {
    const module = nullthrows(graph.dependencies.get(path));
    const color = nullthrows(graph.privateState.gc.color.get(path));
    if (color === 'purple') {
      markGray(module, graph);
    } else {
      graph.privateState.gc.possibleCycleRoots.delete(path);
      if (
        color === 'black' &&
        module.inverseDependencies.size === 0 &&
        !graph.entryPoints.has(path)
      ) {
        freeModule(module, graph, delta);
      }
    }
  }
  // Scan recursively from roots (undo unsuccessful trial deletions)
  for (const path of graph.privateState.gc.possibleCycleRoots) {
    const module = nullthrows(graph.dependencies.get(path));
    scan(module, graph);
  }
  // Collect recursively from roots (free unreachable cycles)
  for (const path of graph.privateState.gc.possibleCycleRoots) {
    graph.privateState.gc.possibleCycleRoots.delete(path);
    const module = nullthrows(graph.dependencies.get(path));
    collectWhite(module, graph, delta);
  }
}

function markGray<T>(module: Module<T>, graph: Graph<T>) {
  const color = nullthrows(graph.privateState.gc.color.get(module.path));
  if (color !== 'gray') {
    graph.privateState.gc.color.set(module.path, 'gray');
    for (const dependency of module.dependencies.values()) {
      const childModule = nullthrows(
        graph.dependencies.get(dependency.absolutePath),
      );
      // The inverse dependency will be restored during the scan phase if this module remains live.
      childModule.inverseDependencies.delete(module.path);
      markGray(childModule, graph);
    }
  }
}

function scan<T>(module: Module<T>, graph: Graph<T>) {
  const color = nullthrows(graph.privateState.gc.color.get(module.path));
  if (color === 'gray') {
    if (
      module.inverseDependencies.size > 0 ||
      graph.entryPoints.has(module.path)
    ) {
      scanBlack(module, graph);
    } else {
      graph.privateState.gc.color.set(module.path, 'white');
      for (const dependency of module.dependencies.values()) {
        const childModule = nullthrows(
          graph.dependencies.get(dependency.absolutePath),
        );
        scan(childModule, graph);
      }
    }
  }
}

function scanBlack<T>(module: Module<T>, graph: Graph<T>) {
  graph.privateState.gc.color.set(module.path, 'black');
  for (const dependency of module.dependencies.values()) {
    const childModule = nullthrows(
      graph.dependencies.get(dependency.absolutePath),
    );
    // The inverse dependency must have been deleted during the mark phase.
    childModule.inverseDependencies.add(module.path);
    const childColor = nullthrows(
      graph.privateState.gc.color.get(childModule.path),
    );
    if (childColor !== 'black') {
      scanBlack(childModule, graph);
    }
  }
}

function collectWhite<T>(module: Module<T>, graph: Graph<T>, delta: Delta) {
  const color = nullthrows(graph.privateState.gc.color.get(module.path));
  if (
    color === 'white' &&
    !graph.privateState.gc.possibleCycleRoots.has(module.path)
  ) {
    graph.privateState.gc.color.set(module.path, 'black');
    for (const dependency of module.dependencies.values()) {
      const childModule = graph.dependencies.get(dependency.absolutePath);
      // The child may already have been collected.
      if (childModule) {
        collectWhite(childModule, graph, delta);
      }
    }
    freeModule(module, graph, delta);
  }
}

/** End of garbage collection functions */

module.exports = {
  createGraph,
  initialTraverseDependencies,
  traverseDependencies,
  reorderGraph,
  markModifiedContextModules,
};
