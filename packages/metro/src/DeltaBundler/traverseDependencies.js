/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

import type {TransformResultDependency} from '../ModuleGraph/types.flow';
import type {Dependency, Graph, Module, Options} from './types.flow';

type Result<T> = {added: Map<string, Module<T>>, deleted: Set<string>};

/**
 * Internal data structure that the traversal logic uses to know which of the
 * files have been modified. This helps us know which files to mark as deleted
 * (a file should not be deleted if it has been added, but it should if it
 * just has been modified).
 **/
type Delta<T> = {
  added: Map<string, Module<T>>,
  modified: Map<string, Module<T>>,
  deleted: Set<string>,
};

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
    added: new Map(),
    modified: new Map(),
    deleted: new Set(),
  };

  await Promise.all(
    paths.map(async path => {
      const module = graph.dependencies.get(path);

      if (!module) {
        return;
      }

      delta.modified.set(module.path, module);

      await traverseDependenciesForSingleFile(module, graph, delta, options);
    }),
  );

  const added = new Map();
  const deleted = new Set();
  const modified = new Map();

  for (const [path, module] of delta.added) {
    added.set(path, module);
  }

  for (const [path, module] of delta.modified) {
    added.set(path, module);
    modified.set(path, module);
  }

  for (const path of delta.deleted) {
    // If a dependency has been marked as deleted, it should never be included
    // in the added group.
    // At the same time, if a dependency has been marked both as added and
    // deleted, it means that this is a renamed file (or that dependency
    // has been removed from one path but added back in a different path).
    // In this case the addition and deletion "get cancelled".
    const markedAsAdded = added.delete(path);

    if (!markedAsAdded || modified.has(path)) {
      deleted.add(path);
    }
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
  graph.entryPoints.forEach(entryPoint => createModule(entryPoint, graph));

  await traverseDependencies(graph.entryPoints, graph, options);

  reorderGraph(graph);

  return {
    added: graph.dependencies,
    deleted: new Set(),
  };
}

async function traverseDependenciesForSingleFile<T>(
  module: Module<T>,
  graph: Graph<T>,
  delta: Delta<T>,
  options: Options<T>,
): Promise<void> {
  let numProcessed = 0;
  let total = 1;
  options.onProgress && options.onProgress(numProcessed, total);

  await processModule(
    module,
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
  module: Module<T>,
  graph: Graph<T>,
  delta: Delta<T>,
  options: Options<T>,
  onDependencyAdd: () => mixed,
  onDependencyAdded: () => mixed,
): Promise<void> {
  const previousDependencies = module.dependencies;

  // Transform the file via the given option.
  const result = await options.transform(module.path);

  // Get the absolute path of all sub-dependencies (some of them could have been
  // moved but maintain the same relative path).
  const currentDependencies = resolveDependencies(
    module.path,
    result.dependencies,
    options,
  );

  // Update the module information.
  module.getSource = result.getSource;
  module.output = result.output;
  module.dependencies = new Map();

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
}

async function addDependency<T>(
  parentModule: Module<T>,
  path: string,
  graph: Graph<T>,
  delta: Delta<T>,
  options: Options<T>,
  onDependencyAdd: () => mixed,
  onDependencyAdded: () => mixed,
): Promise<void> {
  const existingModule = graph.dependencies.get(path);

  // The new dependency was already in the graph, we don't need to do anything.
  if (existingModule) {
    existingModule.inverseDependencies.add(parentModule.path);

    return;
  }

  const module = createModule(path, graph);

  module.inverseDependencies.add(parentModule.path);
  delta.added.set(module.path, module);

  onDependencyAdd();

  await processModule(
    module,
    graph,
    delta,
    options,
    onDependencyAdd,
    onDependencyAdded,
  );

  onDependencyAdded();
}

function removeDependency<T>(
  parentModule: Module<T>,
  absolutePath: string,
  graph: Graph<T>,
  delta: Delta<T>,
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
  for (const [, dependency] of module.dependencies) {
    removeDependency(module, dependency.absolutePath, graph, delta);
  }

  // This module is not used anywhere else!! we can clear it from the bundle
  graph.dependencies.delete(module.path);
}

function createModule<T>(filePath: string, graph: Graph<T>): Module<T> {
  const module = {
    dependencies: new Map(),
    inverseDependencies: new Set(),
    path: filePath,
    getSource: () => '',
    output: [],
  };

  graph.dependencies.set(filePath, module);

  return module;
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
