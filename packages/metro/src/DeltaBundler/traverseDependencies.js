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

const removeInlineRequiresBlacklistFromOptions = require('../lib/removeInlineRequiresBlacklistFromOptions');

import type {Options as JSTransformerOptions} from '../JSTransformer/worker';
import type DependencyGraph from '../node-haste/DependencyGraph';
import type Module from '../node-haste/Module';
import type {MetroSourceMapSegmentTuple} from 'metro-source-map';

export type DependencyType = 'module' | 'script' | 'asset';

export type DependencyEdge = {|
  dependencies: Map<string, string>,
  inverseDependencies: Set<string>,
  path: string,
  output: {
    code: string,
    map: Array<MetroSourceMapSegmentTuple>,
    source: string,
    type: DependencyType,
  },
|};

export type DependencyEdges = Map<string, DependencyEdge>;

type Result = {added: Map<string, DependencyEdge>, deleted: Set<string>};

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

  const added = new Map();
  const deleted = new Set();

  for (const change of changes) {
    for (const [path, edge] of change.added) {
      added.set(path, edge);
    }
    for (const path of change.deleted) {
      // If a path has been marked both as added and deleted, it means that this
      // path is a dependency of a renamed file (or that dependency has been
      // removed from one path but added back in a different path). In this case
      // the addition and deletion "get cancelled".
      if (added.has(path)) {
        added.delete(path);
      } else {
        deleted.add(path);
      }
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
): Promise<Result> {
  createEdge(dependencyGraph.getModuleForPath(path), edges);

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
    return {added: new Map(), deleted: new Set()};
  }

  const result = await dependencyGraph
    .getModuleForPath(path)
    .read(removeInlineRequiresBlacklistFromOptions(path, transformOptions));

  edge.output.code = result.code;
  edge.output.map = result.map;
  edge.output.source = result.source;

  const shallow = result.dependencies;

  // Get the absolute path of all sub-dependencies (some of them could have been
  // moved but maintain the same relative path).
  const currentDependencies = resolveDependencies(
    path,
    shallow,
    dependencyGraph,
    transformOptions,
  );

  const previousDependencies = new Set(edge.dependencies.values());

  let numProcessed = 0;
  let total = 1;
  onProgress(numProcessed, total);

  const deleted = Array.from(edge.dependencies.entries())
    .map(([relativePath, absolutePath]) => {
      if (!currentDependencies.has(absolutePath)) {
        return removeDependency(edge, relativePath, edges);
      } else {
        return undefined;
      }
    })
    .filter(Boolean);

  // Check all the module dependencies and start traversing the tree from each
  // added and removed dependency, to get all the modules that have to be added
  // and removed from the dependency graph.
  const addedDependencies = await Promise.all(
    Array.from(currentDependencies).map(
      async ([absolutePath, relativePath]) => {
        if (previousDependencies.has(absolutePath)) {
          return new Map();
        }

        return await addDependency(
          edge,
          relativePath,
          dependencyGraph,
          transformOptions,
          edges,
          () => {
            total++;
            onProgress(numProcessed, total);
          },
          () => {
            numProcessed++;
            onProgress(numProcessed, total);
          },
        );
      },
    ),
  );

  const added = [new Map([[edge.path, edge]])].concat(addedDependencies);

  numProcessed++;
  onProgress(numProcessed, total);

  return {
    added: flattenMap(reorderDependencies(added, edges)),
    deleted: flatten(deleted),
  };
}

async function addDependency(
  parentEdge: DependencyEdge,
  relativePath: string,
  dependencyGraph: DependencyGraph,
  transformOptions: JSTransformerOptions,
  edges: DependencyEdges,
  onDependencyAdd: () => mixed,
  onDependencyAdded: () => mixed,
): Promise<Map<string, DependencyEdge>> {
  const parentModule = dependencyGraph.getModuleForPath(parentEdge.path);
  const module = dependencyGraph.resolveDependency(
    parentModule,
    relativePath,
    transformOptions.platform,
  );

  // Update the parent edge to keep track of the new dependency.
  parentEdge.dependencies.set(relativePath, module.path);

  const existingEdge = edges.get(module.path);

  // The new dependency was already in the graph, we don't need to do anything.
  if (existingEdge) {
    existingEdge.inverseDependencies.add(parentEdge.path);

    return new Map();
  }

  onDependencyAdd();

  // Create the new edge and traverse all its subdependencies, looking for new
  // subdependencies recursively.
  const edge = createEdge(module, edges);
  edge.inverseDependencies.add(parentEdge.path);

  const addedDependencies = new Map([[edge.path, edge]]);

  const result = await module.read(
    removeInlineRequiresBlacklistFromOptions(edge.path, transformOptions),
  );

  edge.output.code = result.code;
  edge.output.map = result.map;
  edge.output.source = result.source;

  const added = await Promise.all(
    result.dependencies.map(dep =>
      addDependency(
        edge,
        dep,
        dependencyGraph,
        transformOptions,
        edges,
        onDependencyAdd,
        onDependencyAdded,
      ),
    ),
  );

  for (const [newDepPath, newDepEdge] of flattenMap(added)) {
    addedDependencies.set(newDepPath, newDepEdge);
  }

  onDependencyAdded();

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

function createEdge(module: Module, edges: DependencyEdges): DependencyEdge {
  const edge = {
    dependencies: new Map(),
    inverseDependencies: new Set(),
    path: module.path,
    output: {
      code: '',
      map: [],
      source: '',
      type: getType(module),
    },
  };
  edges.set(module.path, edge);

  return edge;
}

function getType(module: Module): DependencyType {
  if (module.isAsset()) {
    return 'asset';
  }

  if (module.isPolyfill()) {
    return 'script';
  }

  return 'module';
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

function resolveDependencies(
  parentPath,
  dependencies: Array<string>,
  dependencyGraph: DependencyGraph,
  transformOptions: JSTransformerOptions,
): Map<string, string> {
  const parentModule = dependencyGraph.getModuleForPath(parentPath);

  return new Map(
    dependencies.map(relativePath => [
      dependencyGraph.resolveDependency(
        parentModule,
        relativePath,
        transformOptions.platform,
      ).path,
      relativePath,
    ]),
  );
}

/**
 * Retraverse the dependency graph in DFS order to reorder the modules and
 * guarantee the same order between runs.
 */
function reorderDependencies(
  dependencies: Array<Map<string, DependencyEdge>>,
  edges: DependencyEdges,
): Array<Map<string, DependencyEdge>> {
  const flatDependencies = flattenMap(dependencies);

  return dependencies.map(dependencies => {
    if (dependencies.size === 0) {
      return new Map();
    }
    return reorderDependency(
      Array.from(dependencies)[0][0],
      flatDependencies,
      edges,
    );
  });
}

function reorderDependency(
  path: string,
  dependencies: Map<string, DependencyEdge>,
  edges: DependencyEdges,
  orderedDependencies?: Map<string, DependencyEdge> = new Map(),
): Map<string, DependencyEdge> {
  const edge = edges.get(path);

  if (!edge || !dependencies.has(path) || orderedDependencies.has(path)) {
    return orderedDependencies;
  }

  orderedDependencies.set(path, edge);

  edge.dependencies.forEach(path =>
    reorderDependency(path, dependencies, edges, orderedDependencies),
  );

  return orderedDependencies;
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

function flattenMap<K, V>(input: Iterable<Map<K, V>>): Map<K, V> {
  const output = new Map();

  for (const items of input) {
    for (const [key, value] of items.entries()) {
      output.set(key, value);
    }
  }

  return output;
}

module.exports = {
  initialTraverseDependencies,
  traverseDependencies,
};
