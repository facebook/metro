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

import type {TransformResultDependency} from '../ModuleGraph/types.flow';
import type {Dependency, Graph, Module, Options} from './types.flow';

type Result<T> = {added: Map<string, Module<T>>, deleted: Set<string>};

/**
 * Internal data structure that the traversal logic uses to know which of the
 * files have been modified. This allows to return the added modules before the
 * modified ones (which is useful for things like Hot Module Reloading).
 **/
type Delta = {|
  +added: Set<string>,
  +modified: Set<string>,
  +deleted: Set<string>,
  +inverseDependencies: Map<string, Set<string>>,
|};

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

  for (const path of paths) {
    // Only process the path if it's part of the dependency graph. It's possible
    // that this method receives a path that is no longer part of it (e.g if a
    // module gets removed from the dependency graph and just afterwards it gets
    // modified), and we have to ignore these cases.
    if (graph.dependencies.get(path)) {
      delta.modified.add(path);

      await traverseDependenciesForSingleFile(path, graph, delta, options);
    }
  }

  const added = new Map();
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
    added.set(path, nullthrows(graph.dependencies.get(path)));
  }

  return {
    added,
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

  await Promise.all(
    graph.entryPoints.map(path =>
      traverseDependenciesForSingleFile(path, graph, delta, options),
    ),
  );

  reorderGraph(graph);

  return {
    added: graph.dependencies,
    deleted: new Set(),
  };
}

async function traverseDependenciesForSingleFile<T>(
  path: string,
  graph: Graph<T>,
  delta: Delta,
  options: Options<T>,
): Promise<void> {
  let numProcessed = 0;
  let total = 1;
  options.onProgress && options.onProgress(numProcessed, total);

  await processModule(
    path,
    graph,
    delta,
    options,
    () => {
      total++;
      options.onProgress && options.onProgress(numProcessed, total);
    },
    () => {
      numProcessed++;
      options.onProgress && options.onProgress(numProcessed, total);
    },
  );

  numProcessed++;
  options.onProgress && options.onProgress(numProcessed, total);
}

async function processModule<T>(
  path: string,
  graph: Graph<T>,
  delta: Delta,
  options: Options<T>,
  onDependencyAdd: () => mixed,
  onDependencyAdded: () => mixed,
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

  for (const [relativePath, dependency] of previousDependencies) {
    if (!currentDependencies.has(relativePath)) {
      removeDependency(module, dependency.absolutePath, graph, delta);
    }
  }

  // Check all the module dependencies and start traversing the tree from each
  // added and removed dependency, to get all the modules that have to be added
  // and removed from the dependency graph.
  const promises = [];

  for (const [relativePath, dependency] of currentDependencies) {
    if (!previousDependencies.has(relativePath)) {
      promises.push(
        addDependency(
          module,
          dependency.absolutePath,
          graph,
          delta,
          options,
          onDependencyAdd,
          onDependencyAdded,
        ),
      );
    }
  }

  await Promise.all(promises);

  return module;
}

async function addDependency<T>(
  parentModule: Module<T>,
  path: string,
  graph: Graph<T>,
  delta: Delta,
  options: Options<T>,
  onDependencyAdd: () => mixed,
  onDependencyAdded: () => mixed,
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

  onDependencyAdd();

  const module = await processModule(
    path,
    graph,
    delta,
    options,
    onDependencyAdd,
    onDependencyAdded,
  );

  graph.dependencies.set(module.path, module);
  module.inverseDependencies.add(parentModule.path);

  onDependencyAdded();
}

function removeDependency<T>(
  parentModule: Module<T>,
  absolutePath: string,
  graph: Graph<T>,
  delta: Delta,
): void {
  const module = graph.dependencies.get(absolutePath);

  if (!module) {
    return;
  }

  module.inverseDependencies.delete(parentModule.path);

  // This module is still used by another modules, so we cannot remove it from
  // the bundle.
  if (module.inverseDependencies.size) {
    return;
  }

  delta.deleted.add(module.path);

  // Now we need to iterate through the module dependencies in order to
  // clean up everything (we cannot read the module because it may have
  // been deleted).
  for (const dependency of module.dependencies.values()) {
    removeDependency(module, dependency.absolutePath, graph, delta);
  }

  // This module is not used anywhere else!! we can clear it from the bundle
  graph.dependencies.delete(module.path);
}

function resolveDependencies<T>(
  parentPath: string,
  dependencies: $ReadOnlyArray<TransformResultDependency>,
  options: Options<T>,
): Map<string, Dependency> {
  return new Map(
    dependencies.map(result => {
      const relativePath = result.name;

      const dependency = {
        absolutePath: options.resolve(parentPath, result.name),
        data: result,
      };

      return [relativePath, dependency];
    }),
  );
}

/**
 * Re-traverse the dependency graph in DFS order to reorder the modules and
 * guarantee the same order between runs. This method mutates the passed graph.
 */
function reorderGraph<T>(graph: Graph<T>) {
  const orderedDependencies = new Map();

  graph.entryPoints.forEach(entryPoint => {
    const mainModule = graph.dependencies.get(entryPoint);

    if (!mainModule) {
      throw new ReferenceError('Module not registered in graph: ' + entryPoint);
    }

    reorderDependencies(graph, mainModule, orderedDependencies);
  });

  graph.dependencies = orderedDependencies;
}

function reorderDependencies<T>(
  graph: Graph<T>,
  module: Module<T>,
  orderedDependencies: Map<string, Module<T>>,
): void {
  if (module.path) {
    if (orderedDependencies.has(module.path)) {
      return;
    }

    orderedDependencies.set(module.path, module);
  }

  module.dependencies.forEach(dependency => {
    const path = dependency.absolutePath;
    const childModule = graph.dependencies.get(path);

    if (!childModule) {
      throw new ReferenceError('Module not registered in graph: ' + path);
    }

    reorderDependencies(graph, childModule, orderedDependencies);
  });
}

module.exports = {
  initialTraverseDependencies,
  traverseDependencies,
  reorderGraph,
};
