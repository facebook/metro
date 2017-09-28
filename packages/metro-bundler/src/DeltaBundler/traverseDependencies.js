/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

import type {Options as JSTransformerOptions} from '../JSTransformer/worker';
import type DependencyGraph from '../node-haste/DependencyGraph';
import type {
  InverseDependencies,
  ModulePaths,
  ShallowDependencies,
} from './DeltaCalculator';

export type Caches = {|
  inverseDependencies: InverseDependencies,
  modules: ModulePaths,
  shallowDependencies: ShallowDependencies,
|};

export type DependencyEdge = {|
  dependencies: Map<string, string>,
  inverseDependencies: Set<string>,
  path: string,
|};

export type DependencyEdges = Map<string, DependencyEdge>;

type Result = {added: Set<string>, deleted: Set<string>};

/**
 * Dependency Traversal logic for the Delta Bundler. This method calculates
 * the modules that should be included in the bundle by traversing the
 * dependency graph.
 * Instead of traversing the whole graph each time, it just calculates the
 * difference between runs by only traversing the added/removed dependencies.
 * To do so, it uses the passed `edges` paramater, which is a data structure
 * that contains the whole status of the dependency graph. During the
 * recalculation of the dependencies, it mutates the edges graph.
 *
 * The paths parameter contains the absolute paths of the root files that the
 * method should traverse. Normally, these paths should be the modified files
 * since the last traversal.
 */
async function traverseDependencies(
  paths: Array<string>,
  dependencyGraph: DependencyGraph,
  transformOptions: JSTransformerOptions,
  edges: DependencyEdges,
  onProgress?: (numProcessed: number, total: number) => mixed = () => {},
): Promise<Result> {
  const changes = await Promise.all(
    paths.map(path =>
      traverseDependenciesForSingleFile(
        path,
        dependencyGraph,
        transformOptions,
        edges,
        onProgress,
      ),
    ),
  );

  const added = new Set();
  const deleted = new Set();

  for (const change of changes) {
    for (const path of change.added) {
      added.add(path);
    }
    for (const path of change.deleted) {
      deleted.add(path);
    }
  }

  return {
    added,
    deleted,
  };
}

async function initialTraverseDependencies(
  path: string,
  dependencyGraph: DependencyGraph,
  transformOptions: JSTransformerOptions,
  edges: DependencyEdges,
  onProgress?: (numProcessed: number, total: number) => mixed = () => {},
) {
  createEdge(path, edges);

  return await traverseDependenciesForSingleFile(
    path,
    dependencyGraph,
    transformOptions,
    edges,
    onProgress,
  );
}

async function traverseDependenciesForSingleFile(
  path: string,
  dependencyGraph: DependencyGraph,
  transformOptions: JSTransformerOptions,
  edges: DependencyEdges,
  onProgress?: (numProcessed: number, total: number) => mixed = () => {},
): Promise<Result> {
  const edge = edges.get(path);

  // If the passed edge does not exist does not exist in the graph, ignore it.
  if (!edge) {
    return {added: new Set(), deleted: new Set()};
  }

  const currentDependencies = new Set(
    await dependencyGraph.getShallowDependencies(path, transformOptions),
  );
  const previousDependencies = new Set(edge.dependencies.keys());

  const nonNullEdge = edge;

  let numProcessed = 0;
  let total = currentDependencies.size;

  // Check all the module dependencies and start traversing the tree from each
  // added and removed dependency, to get all the modules that have to be added
  // and removed from the dependency graph.
  const added = await Promise.all(
    Array.from(currentDependencies).map(async dependency => {
      let newDependencies;

      if (!previousDependencies.has(dependency)) {
        newDependencies = await addDependency(
          nonNullEdge,
          dependency,
          dependencyGraph,
          transformOptions,
          edges,
        );
      } else {
        newDependencies = new Set();
      }

      numProcessed += newDependencies.size + 1;
      total += newDependencies.size;
      onProgress(numProcessed, total);

      return newDependencies;
    }),
  );

  // Check if all currentDependencies are still in the bundle (some files can
  // have been removed).
  checkModuleDependencies(
    path,
    currentDependencies,
    dependencyGraph,
    transformOptions,
    edges,
  );

  const deleted = Array.from(previousDependencies)
    .map(dependency => {
      if (!currentDependencies.has(dependency)) {
        return removeDependency(nonNullEdge, dependency, edges);
      } else {
        return undefined;
      }
    })
    .filter(Boolean);

  return {
    added: flatten(added),
    deleted: flatten(deleted),
  };
}

async function addDependency(
  parentEdge: DependencyEdge,
  relativePath: string,
  dependencyGraph: DependencyGraph,
  transformOptions: JSTransformerOptions,
  edges: DependencyEdges,
): Promise<Set<string>> {
  const parentModule = dependencyGraph.getModuleForPath(parentEdge.path);
  const module = dependencyGraph.resolveDependency(
    parentModule,
    relativePath,
    transformOptions.platform,
  );

  // Update the parent edge to keep track of the new dependency.
  parentEdge.dependencies.set(relativePath, module.path);

  let dependencyEdge = edges.get(module.path);

  // The new dependency was already in the graph, we don't need to do anything.
  if (dependencyEdge) {
    dependencyEdge.inverseDependencies.add(parentEdge.path);

    return new Set();
  }

  // Create the new edge and traverse all its subdependencies, looking for new
  // subdependencies recursively.
  dependencyEdge = createEdge(module.path, edges);
  dependencyEdge.inverseDependencies.add(parentEdge.path);

  const addedDependencies = new Set([dependencyEdge.path]);

  const shallowDeps = await dependencyGraph.getShallowDependencies(
    dependencyEdge.path,
    transformOptions,
  );

  const nonNullDependencyEdge = dependencyEdge;

  const added = await Promise.all(
    shallowDeps.map(dep =>
      addDependency(
        nonNullDependencyEdge,
        dep,
        dependencyGraph,
        transformOptions,
        edges,
      ),
    ),
  );

  for (const newDependency of flatten(added)) {
    addedDependencies.add(newDependency);
  }

  return addedDependencies;
}

function removeDependency(
  parentEdge: DependencyEdge,
  relativePath: string,
  edges: DependencyEdges,
): Set<string> {
  // Find the actual edge that represents the removed dependency. We do this
  // from the egdes data structure, since the file may have been deleted
  // already.
  const dependencyEdge = resolveEdge(parentEdge, relativePath, edges);
  if (!dependencyEdge) {
    return new Set();
  }

  parentEdge.dependencies.delete(relativePath);
  dependencyEdge.inverseDependencies.delete(parentEdge.path);

  // This module is still used by another modules, so we cannot remove it from
  // the bundle.
  if (dependencyEdge.inverseDependencies.size) {
    return new Set();
  }

  const removedDependencies = new Set([dependencyEdge.path]);

  // Now we need to iterate through the module dependencies in order to
  // clean up everything (we cannot read the module because it may have
  // been deleted).
  for (const subDependency of dependencyEdge.dependencies.keys()) {
    const removed = removeDependency(dependencyEdge, subDependency, edges);

    for (const removedDependency of removed.values()) {
      removedDependencies.add(removedDependency);
    }
  }

  // This module is not used anywhere else!! we can clear it from the bundle
  destroyEdge(dependencyEdge, edges);

  return removedDependencies;
}

function createEdge(path: string, edges: DependencyEdges): DependencyEdge {
  const edge = {
    dependencies: new Map(),
    inverseDependencies: new Set(),
    path,
  };
  edges.set(path, edge);

  return edge;
}

function destroyEdge(edge: DependencyEdge, edges: DependencyEdges) {
  edges.delete(edge.path);
}

function resolveEdge(
  parentEdge: DependencyEdge,
  relativePath: string,
  edges: DependencyEdges,
): ?DependencyEdge {
  const absolutePath = parentEdge.dependencies.get(relativePath);
  if (!absolutePath) {
    return null;
  }

  return edges.get(absolutePath);
}

function checkModuleDependencies(
  parentPath,
  dependencies: Set<string>,
  dependencyGraph: DependencyGraph,
  transformOptions: JSTransformerOptions,
  edges: DependencyEdges,
) {
  const parentModule = dependencyGraph.getModuleForPath(parentPath);

  for (const dependency of dependencies.values()) {
    dependencyGraph.resolveDependency(
      parentModule,
      dependency,
      transformOptions.platform,
    );
  }
}

function flatten<T>(input: Iterable<Iterable<T>>): Set<T> {
  const output = new Set();

  for (const items of input) {
    for (const item of items) {
      output.add(item);
    }
  }

  return output;
}

module.exports = {
  initialTraverseDependencies,
  traverseDependencies,
};
