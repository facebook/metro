/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const nullthrows = require('nullthrows');

import type {
  Dependency,
  Graph,
  Module,
  Options,
  TransformResultDependency,
} from './types.flow';

type Result<T> = {
  added: Map<string, Module<T>>,
  modified: Map<string, Module<T>>,
  deleted: Set<string>,
  ...
};

/**
 * Internal data structure that the traversal logic uses to know which of the
 * files have been modified. This allows to return the added modules before the
 * modified ones (which is useful for things like Hot Module Reloading).
 **/
type Delta = $ReadOnly<{|
  added: Set<string>,
  modified: Set<string>,
  deleted: Set<string>,
  inverseDependencies: Map<string, Set<string>>,
|}>;

type InternalOptions<T> = $ReadOnly<{|
  experimentalImportBundleSupport: boolean,
  onDependencyAdd: () => mixed,
  onDependencyAdded: () => mixed,
  resolve: $PropertyType<Options<T>, 'resolve'>,
  transform: $PropertyType<Options<T>, 'transform'>,
  shallow: boolean,
|}>;

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
 * To do so, it uses the passed passed graph dependencies and it mutates it.
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
    inverseDependencies: new Map(),
  };

  const internalOptions = getInternalOptions(options);

  for (const path of paths) {
    // Only process the path if it's part of the dependency graph. It's possible
    // that this method receives a path that is no longer part of it (e.g if a
    // module gets removed from the dependency graph and just afterwards it gets
    // modified), and we have to ignore these cases.
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

  const added = new Map();
  const modified = new Map();
  const deleted = new Set();

  for (const path of delta.deleted) {
    // If a dependency has been marked both as added and deleted, it means that
    // this is a renamed file (or that dependency has been removed from one path
    // but added back in a different path). In this case the addition and
    // deletion "get cancelled".
    if (!delta.added.has(path)) {
      deleted.add(path);
    }

    delta.modified.delete(path);
    delta.added.delete(path);
  }

  for (const path of delta.added) {
    added.set(path, nullthrows(graph.dependencies.get(path)));
  }

  for (const path of delta.modified) {
    // Similarly to the above, a file can be marked as both added and modified
    // when its path and dependencies have changed. In this case, we only
    // consider the addition.
    if (!delta.added.has(path)) {
      modified.set(path, nullthrows(graph.dependencies.get(path)));
    }
  }

  return {
    added,
    modified,
    deleted,
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
    inverseDependencies: new Map(),
  };

  const internalOptions = getInternalOptions(options);

  await Promise.all(
    graph.entryPoints.map((path: string) =>
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
  // Transform the file via the given option.
  const result = await options.transform(path);

  // Get the absolute path of all sub-dependencies (some of them could have been
  // moved but maintain the same relative path).
  const currentDependencies = resolveDependencies(
    path,
    result.dependencies,
    options,
  );

  const previousModule = graph.dependencies.get(path) || {
    inverseDependencies: delta.inverseDependencies.get(path) || new Set(),
    path,
  };
  const previousDependencies = previousModule.dependencies || new Map();

  // Update the module information.
  const module = {
    ...previousModule,
    dependencies: new Map(),
    getSource: result.getSource,
    output: result.output,
  };
  graph.dependencies.set(module.path, module);

  for (const [relativePath, dependency] of currentDependencies) {
    module.dependencies.set(relativePath, dependency);
  }

  Array.from(previousDependencies.entries())
    .filter(
      ([relativePath, dependency]) =>
        !currentDependencies.has(relativePath) ||
        nullthrows(currentDependencies.get(relativePath)).absolutePath !==
          dependency.absolutePath,
    )
    .forEach(([relativePath, dependency]) =>
      removeDependency(
        module,
        dependency.absolutePath,
        graph,
        delta,
        new Set(),
      ),
    );

  // Check all the module dependencies and start traversing the tree from each
  // added and removed dependency, to get all the modules that have to be added
  // and removed from the dependency graph.
  const promises = [];

  for (const [relativePath, dependency] of currentDependencies) {
    if (!options.shallow) {
      if (
        options.experimentalImportBundleSupport &&
        dependency.data.data.asyncType != null
      ) {
        graph.importBundleNames.add(dependency.absolutePath);
      } else if (
        !previousDependencies.has(relativePath) ||
        nullthrows(previousDependencies.get(relativePath)).absolutePath !==
          dependency.absolutePath
      ) {
        promises.push(
          addDependency(module, dependency.absolutePath, graph, delta, options),
        );
      }
    }
  }

  try {
    await Promise.all(promises);
  } catch (err) {
    // If there is an error, restore the previous dependency list.
    // This ensures we don't skip over them during the next traversal attempt.
    module.dependencies = previousDependencies;
    throw err;
  }
  return module;
}

async function addDependency<T>(
  parentModule: Module<T>,
  path: string,
  graph: Graph<T>,
  delta: Delta,
  options: InternalOptions<T>,
): Promise<void> {
  // The new dependency was already in the graph, we don't need to do anything.
  const existingModule = graph.dependencies.get(path);

  if (existingModule) {
    existingModule.inverseDependencies.add(parentModule.path);

    return;
  }

  // This module is being transformed at the moment in parallel, so we should
  // only mark its parent as an inverse dependency.
  const inverse = delta.inverseDependencies.get(path);
  if (inverse) {
    inverse.add(parentModule.path);

    return;
  }

  delta.added.add(path);
  delta.inverseDependencies.set(path, new Set([parentModule.path]));

  options.onDependencyAdd();

  const module = await processModule(path, graph, delta, options);

  graph.dependencies.set(module.path, module);
  module.inverseDependencies.add(parentModule.path);

  options.onDependencyAdded();
}

/**
 * Recursively look up `inverseDependencies` until it is empty,
 * returning a set of paths for the last module that does not have
 * `inverseDependencies`.
 */
function getAllTopLevelInverseDependencies<T>(
  inverseDependencies: Set<string>,
  graph: Graph<T>,
  currModule: string,
  visited: Set<string>,
): Set<string> {
  if (visited.has(currModule)) {
    return new Set();
  }
  visited.add(currModule);
  if (!inverseDependencies.size) {
    return new Set([currModule]);
  }

  return Array.from(inverseDependencies)
    .filter(inverseDep => graph.dependencies.has(inverseDep))
    .reduce((acc, inverseDep) => {
      const mod = graph.dependencies.get(inverseDep);
      if (!mod) {
        return acc;
      }
      getAllTopLevelInverseDependencies(
        mod.inverseDependencies,
        graph,
        inverseDep,
        visited,
      ).forEach(x => {
        acc.add(x);
      });
      return acc;
    }, new Set());
}

/**
 * Given `inverseDependencies`, tracing back inverse dependencies to
 * see if it only leads back to `parentModule`.
 */
function canSafelyRemoveFromParentModule<T>(
  inverseDependencies: Set<string>,
  parentModule: string,
  graph: Graph<T>,
  canBeRemovedSafely: Set<string>,
  delta: Delta,
): boolean {
  const visited = new Set();
  const topInverseDependencies = getAllTopLevelInverseDependencies(
    inverseDependencies,
    graph,
    '', // current module name
    visited,
  );

  if (!topInverseDependencies.size) {
    /**
     * This happens when parentModule and inverseDependencies have a circular dependency.
     * This will eventually become an empty set due to the `visited` Set being the
     * base case for the recursive call.
     */
    return true;
  }

  const undeletedInverseDependencies = Array.from(
    topInverseDependencies,
  ).filter(x => !delta.deleted.has(x));

  /**
   * We can only mark the `visited` Set of modules to be safely removable if
   * 1. We do not have top a level module to compare with parentModule.
   *   This can happen when trying to see if we can safely remove from
   *   a module that was deleted. This is why we filtered them out with `delta.deleted`
   * 2. We have one top module and it is parentModule
   */
  const canSafelyRemove =
    !undeletedInverseDependencies.length ||
    (undeletedInverseDependencies.length === 1 &&
      undeletedInverseDependencies[0] === parentModule);

  if (canSafelyRemove) {
    visited.forEach(mod => {
      canBeRemovedSafely.add(mod);
    });
  }
  return canSafelyRemove;
}

function removeDependency<T>(
  parentModule: Module<T>,
  absolutePath: string,
  graph: Graph<T>,
  delta: Delta,
  // We use `canBeRemovedSafely` set to keep track of visited
  // module(s) that we're sure can be removed. This will skip expensive
  // inverse dependency traversals.
  canBeRemovedSafely: Set<string> = new Set(),
): void {
  const module = graph.dependencies.get(absolutePath);

  if (!module) {
    return;
  }

  module.inverseDependencies.delete(parentModule.path);

  // Even if there are modules still using parentModule, we want to ensure
  // there is no circular dependency. Thus, we check if it can be safely removed
  // by tracing back the inverseDependencies.
  if (!canBeRemovedSafely.has(module.path)) {
    if (
      module.inverseDependencies.size &&
      !canSafelyRemoveFromParentModule(
        module.inverseDependencies,
        module.path,
        graph,
        canBeRemovedSafely,
        delta,
      )
    ) {
      return;
    }
  }

  delta.deleted.add(module.path);

  // Now we need to iterate through the module dependencies in order to
  // clean up everything (we cannot read the module because it may have
  // been deleted).
  Array.from(module.dependencies.values())
    .filter(
      dependency =>
        !delta.deleted.has(dependency.absolutePath) &&
        dependency.absolutePath !== parentModule.path,
    )
    .forEach(dependency =>
      removeDependency(
        module,
        dependency.absolutePath,
        graph,
        delta,
        canBeRemovedSafely,
      ),
    );
  // This module is not used anywhere else!! we can clear it from the bundle
  graph.dependencies.delete(module.path);
}

function resolveDependencies<T>(
  parentPath: string,
  dependencies: $ReadOnlyArray<TransformResultDependency>,
  options: InternalOptions<T>,
): Map<string, Dependency> {
  const resolve = (parentPath: string, result: TransformResultDependency) => {
    const relativePath = result.name;
    try {
      return [
        relativePath,
        {
          absolutePath: options.resolve(parentPath, relativePath),
          data: result,
        },
      ];
    } catch (error) {
      // Ignore unavailable optional dependencies. They are guarded
      // with a try-catch block and will be handled during runtime.
      if (result.data.isOptional !== true) {
        throw error;
      }
    }
    return undefined;
  };

  const resolved = dependencies.reduce(
    (list: Array<[string, Dependency]>, result: TransformResultDependency) => {
      const resolvedPath = resolve(parentPath, result);
      if (resolvedPath) {
        list.push(resolvedPath);
      }
      return list;
    },
    [],
  );
  return new Map(resolved);
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

module.exports = {
  initialTraverseDependencies,
  traverseDependencies,
  reorderGraph,
};
