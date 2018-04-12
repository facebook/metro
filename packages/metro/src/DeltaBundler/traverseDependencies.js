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

export type Graph = {|
  dependencies: DependencyEdges,
  entryPoints: $ReadOnlyArray<string>,
|};

type Result = {added: Map<string, DependencyEdge>, deleted: Set<string>};

/**
 * Internal data structure that the traversal logic uses to know which of the
 * files have been modified. This helps us know which files to mark as deleted
 * (a file should not be deleted if it has been added, but it should if it
 * just has been modified).
 **/
type Delta = {
  added: Map<string, DependencyEdge>,
  modified: Map<string, DependencyEdge>,
  deleted: Set<string>,
};

export type TransformOptions = {|
  ...JSTransformerOptions,
  type: 'module' | 'script',
|};

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
  paths: $ReadOnlyArray<string>,
  dependencyGraph: DependencyGraph,
  transformOptions: TransformOptions,
  graph: Graph,
  onProgress?: (numProcessed: number, total: number) => mixed = () => {},
): Promise<Result> {
  const delta = {
    added: new Map(),
    modified: new Map(),
    deleted: new Set(),
  };

  await Promise.all(
    paths.map(async path => {
      const edge = graph.dependencies.get(path);

      if (!edge) {
        return;
      }

      delta.modified.set(edge.path, edge);

      await traverseDependenciesForSingleFile(
        edge,
        dependencyGraph,
        transformOptions,
        graph,
        delta,
        onProgress,
      );
    }),
  );

  const added = new Map();
  const deleted = new Set();
  const modified = new Map();

  for (const [path, edge] of delta.added) {
    added.set(path, edge);
  }

  for (const [path, edge] of delta.modified) {
    added.set(path, edge);
    modified.set(path, edge);
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

async function initialTraverseDependencies(
  graph: Graph,
  dependencyGraph: DependencyGraph,
  transformOptions: TransformOptions,
  onProgress?: (numProcessed: number, total: number) => mixed = () => {},
): Promise<Result> {
  graph.entryPoints.forEach(entryPoint =>
    createEdge(
      dependencyGraph.getModuleForPath(
        entryPoint,
        transformOptions.type === 'script',
      ),
      graph,
    ),
  );

  await traverseDependencies(
    graph.entryPoints,
    dependencyGraph,
    transformOptions,
    graph,
    onProgress,
  );

  reorderGraph(graph);

  return {
    added: graph.dependencies,
    deleted: new Set(),
  };
}

async function traverseDependenciesForSingleFile(
  edge: DependencyEdge,
  dependencyGraph: DependencyGraph,
  transformOptions: TransformOptions,
  graph: Graph,
  delta: Delta,
  onProgress?: (numProcessed: number, total: number) => mixed = () => {},
): Promise<void> {
  let numProcessed = 0;
  let total = 1;
  onProgress(numProcessed, total);

  await processEdge(
    edge,
    dependencyGraph,
    transformOptions,
    graph,
    delta,
    () => {
      total++;
      onProgress(numProcessed, total);
    },
    () => {
      numProcessed++;
      onProgress(numProcessed, total);
    },
  );

  numProcessed++;
  onProgress(numProcessed, total);
}

async function processEdge(
  edge: DependencyEdge,
  dependencyGraph: DependencyGraph,
  transformOptions: TransformOptions,
  graph: Graph,
  delta: Delta,
  onDependencyAdd: () => mixed,
  onDependencyAdded: () => mixed,
): Promise<void> {
  const previousDependencies = edge.dependencies;

  const {type, ...workerTransformOptions} = transformOptions;

  const module = dependencyGraph.getModuleForPath(edge.path, type === 'script');
  const result = await module.read(
    removeInlineRequiresBlacklistFromOptions(edge.path, workerTransformOptions),
  );

  // Get the absolute path of all sub-dependencies (some of them could have been
  // moved but maintain the same relative path).
  const currentDependencies = resolveDependencies(
    edge.path,
    result.dependencies,
    dependencyGraph,
    transformOptions,
  );

  // Update the edge information.
  edge.output.code = result.code;
  edge.output.map = result.map;
  // TODO(T28259615): Remove as soon as possible to avoid leaking.
  // Lazily access source code; if not needed, don't read the file.
  // eslint-disable-next-line lint/flow-no-fixme
  // $FlowFixMe: "defineProperty" with a getter is buggy in flow.
  Object.defineProperty(edge.output, 'source', {
    configurable: true,
    enumerable: true,
    get: () => result.source,
  });
  edge.dependencies = new Map();

  currentDependencies.forEach((absolutePath, relativePath) => {
    edge.dependencies.set(relativePath, absolutePath);
  });

  for (const [relativePath, absolutePath] of previousDependencies) {
    if (!currentDependencies.has(relativePath)) {
      removeDependency(edge, absolutePath, graph, delta);
    }
  }

  // Check all the module dependencies and start traversing the tree from each
  // added and removed dependency, to get all the modules that have to be added
  // and removed from the dependency graph.
  await Promise.all(
    Array.from(currentDependencies.entries()).map(
      async ([relativePath, absolutePath]) => {
        if (previousDependencies.has(relativePath)) {
          return;
        }

        await addDependency(
          edge,
          absolutePath,
          dependencyGraph,
          transformOptions,
          graph,
          delta,
          onDependencyAdd,
          onDependencyAdded,
        );
      },
    ),
  );
}

async function addDependency(
  parentEdge: DependencyEdge,
  path: string,
  dependencyGraph: DependencyGraph,
  transformOptions: TransformOptions,
  graph: Graph,
  delta: Delta,
  onDependencyAdd: () => mixed,
  onDependencyAdded: () => mixed,
): Promise<void> {
  const existingEdge = graph.dependencies.get(path);

  // The new dependency was already in the graph, we don't need to do anything.
  if (existingEdge) {
    existingEdge.inverseDependencies.add(parentEdge.path);

    return;
  }

  const edge = createEdge(
    dependencyGraph.getModuleForPath(path, transformOptions.type === 'script'),
    graph,
  );

  edge.inverseDependencies.add(parentEdge.path);
  delta.added.set(edge.path, edge);

  onDependencyAdd();

  await processEdge(
    edge,
    dependencyGraph,
    transformOptions,
    graph,
    delta,
    onDependencyAdd,
    onDependencyAdded,
  );

  onDependencyAdded();
}

function removeDependency(
  parentEdge: DependencyEdge,
  absolutePath: string,
  graph: Graph,
  delta: Delta,
): void {
  const edge = graph.dependencies.get(absolutePath);

  if (!edge) {
    return;
  }

  edge.inverseDependencies.delete(parentEdge.path);

  // This module is still used by another modules, so we cannot remove it from
  // the bundle.
  if (edge.inverseDependencies.size) {
    return;
  }

  delta.deleted.add(edge.path);

  // Now we need to iterate through the module dependencies in order to
  // clean up everything (we cannot read the module because it may have
  // been deleted).
  for (const depAbsolutePath of edge.dependencies.values()) {
    removeDependency(edge, depAbsolutePath, graph, delta);
  }

  // This module is not used anywhere else!! we can clear it from the bundle
  destroyEdge(edge, graph);
}

function createEdge(module: Module, graph: Graph): DependencyEdge {
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
  graph.dependencies.set(module.path, edge);

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

function destroyEdge(edge: DependencyEdge, graph: Graph) {
  graph.dependencies.delete(edge.path);
}

function resolveDependencies(
  parentPath,
  dependencies: $ReadOnlyArray<string>,
  dependencyGraph: DependencyGraph,
  transformOptions: TransformOptions,
): Map<string, string> {
  const parentModule = dependencyGraph.getModuleForPath(
    parentPath,
    transformOptions.type === 'string',
  );

  return new Map(
    dependencies.map(relativePath => [
      relativePath,
      dependencyGraph.resolveDependency(
        parentModule,
        relativePath,
        transformOptions.platform,
      ).path,
    ]),
  );
}

/**
 * Retraverse the dependency graph in DFS order to reorder the modules and
 * guarantee the same order between runs. This method mutates the passed graph.
 */
function reorderGraph(graph: Graph) {
  const parent = {
    dependencies: new Map(graph.entryPoints.map(e => [e, e])),
  };

  const dependencies = reorderDependencies(parent, graph.dependencies);

  graph.dependencies = dependencies;
}

function reorderDependencies(
  edge: {|dependencies: Map<string, string>|} | DependencyEdge,
  dependencies: Map<string, DependencyEdge>,
  orderedDependencies?: Map<string, DependencyEdge> = new Map(),
): Map<string, DependencyEdge> {
  if (edge.path) {
    if (orderedDependencies.has(edge.path)) {
      return orderedDependencies;
    }

    orderedDependencies.set(edge.path, edge);
  }

  edge.dependencies.forEach(path => {
    const dep = dependencies.get(path);
    if (dep) {
      reorderDependencies(dep, dependencies, orderedDependencies);
    }
  });

  return orderedDependencies;
}

module.exports = {
  initialTraverseDependencies,
  traverseDependencies,
  reorderGraph,
};
