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

const path = require('path');

import type {
  CyGraph,
  Node,
  Edge,
  ModuleList,
  GraphInfo,
} from 'metro-visualizer/src/types.flow';
import type {Module} from 'metro/src/DeltaBundler/types.flow';
import type {Graph} from 'metro/src/DeltaBundler';

class PathSearchError extends Error {}

function getModule(metroGraph: Graph<>, modulePath: string): Module<> {
  const module = metroGraph.dependencies.get(modulePath);
  if (module == null) {
    throw new Error(`Module not found for path: ${modulePath}`);
  }
  return module;
}

function getGraphToModule(metroGraph: Graph<>, modulePath: string): CyGraph {
  const nodes: Set<Node> = new Set();
  const edges: Array<Edge> = [];

  const module = getModule(metroGraph, modulePath);
  nodes.add(moduleToNode(module, metroGraph));

  for (const parentPath of module.inverseDependencies) {
    const parentModule = getModule(metroGraph, parentPath);
    const dep = parentModule.dependencies.get(path.basename(modulePath, '.js'));

    nodes.add(moduleToNode(parentModule, metroGraph));
    edges.push(
      createEdge(parentPath, modulePath, dep ? dep.data.data.isAsync : false),
    );
  }

  return {nodes: [...nodes], edges};
}

function getGraphFromModule(
  metroGraph: Graph<>,
  modulePath: string,
  inverse?: boolean = false,
): CyGraph {
  const nodes: Set<Node> = new Set();
  const edges: Array<Edge> = [];

  const module = getModule(metroGraph, modulePath);
  nodes.add(moduleToNode(module, metroGraph));

  for (const dep of module.dependencies.values()) {
    const depModule = getModule(metroGraph, dep.absolutePath);
    nodes.add(moduleToNode(depModule, metroGraph));
    edges.push(createEdge(modulePath, dep.absolutePath, dep.data.data.isAsync));
  }

  return {nodes: [...nodes], edges};
}

function getGraphFromModuleToModule(
  metroGraph: Graph<>,
  origin: string,
  target: string,
): CyGraph {
  let resultGraph = {nodes: new Map(), edges: []};
  let prevError = false;
  let inverse = false;

  while (true) {
    try {
      _buildGraphFromModuleToModule(
        metroGraph,
        origin,
        target,
        resultGraph,
        inverse,
      );
      break;
    } catch (e) {
      if (
        prevError ||
        !(e instanceof PathSearchError || e instanceof RangeError)
      ) {
        throw e;
      }
      prevError = true;
      resultGraph = {nodes: new Map(), edges: []};
      inverse = true;
    }
  }

  return {nodes: [...resultGraph.nodes.values()], edges: resultGraph.edges};
}

function _addPathToGraph(
  graphPath: Set<string>,
  graph: {nodes: Map<string, Node>, edges: Array<Edge>},
  metroGraph: Graph<>,
  inverse: boolean,
) {
  const p = inverse ? [...graphPath].reverse() : [...graphPath];
  for (var i = 0; i < graphPath.size - 1; i++) {
    const mod = getModule(metroGraph, p[i]);
    const dep = mod.dependencies.get(p[i + 1]);
    graph.nodes.set(p[i], moduleToNode(mod, metroGraph));
    graph.edges.push(
      createEdge(p[i], p[i + 1], dep ? dep.data.data.isAsync : false),
    );
  }
  if (!graph.nodes.has(p[p.length - 1])) {
    graph.nodes.set(
      p[p.length - 1],
      moduleToNode(getModule(metroGraph, p[p.length - 1]), metroGraph),
    );
  }
}

function _buildGraphFromModuleToModule(
  metroGraph: Graph<>,
  origin: string,
  target: string,
  resultGraph: {nodes: Map<string, Node>, edges: Array<Edge>},
  inverse: boolean = false,
  currentPath: Set<string> = new Set(),
  maxDepth: number = 200,
  maxDegree: number = 100,
): ?CyGraph {
  const nextNode = inverse ? target : origin;
  if (currentPath.has(nextNode) || currentPath.size > maxDepth) {
    // Prevent cycles and stack overflows
    return;
  }

  currentPath.add(nextNode);

  if (origin === target) {
    _addPathToGraph(currentPath, resultGraph, metroGraph, inverse);
    return;
  }

  if (resultGraph.nodes.has(nextNode)) {
    _addPathToGraph(currentPath, resultGraph, metroGraph, inverse);
    return;
  }

  const deps = inverse
    ? [...getModule(metroGraph, target).inverseDependencies.values()]
    : [...getModule(metroGraph, origin).dependencies.values()].map(
        d => d.absolutePath,
      );

  if (deps.length > maxDegree && !inverse) {
    // A custom error is thrown to signal that it might be faster to perfom
    // the algorithm inversely
    throw new PathSearchError();
  }

  for (const dep of deps) {
    _buildGraphFromModuleToModule(
      metroGraph,
      inverse ? origin : dep,
      inverse ? dep : target,
      resultGraph,
      inverse,
      new Set(currentPath),
      maxDepth,
      maxDegree,
    );
  }
}

function getGraphInfo(
  metroGraph: Graph<>,
): {modules: ModuleList, info: GraphInfo} {
  const modules: ModuleList = [];
  const depTypes: Set<string> = new Set();
  let maxIncomingEdges: number = 0;
  let maxOutgoingEdges: number = 0;

  for (const [modulePath, module] of metroGraph.dependencies.entries()) {
    maxOutgoingEdges = Math.max(module.dependencies.size, maxOutgoingEdges);
    maxIncomingEdges = Math.max(
      module.inverseDependencies.size,
      maxIncomingEdges,
    );
    depTypes.add(module.output[0].type);
    modules.push({
      name: path.basename(modulePath, '.js'),
      filePath: modulePath,
    });
  }

  return {
    modules,
    info: {
      maxIncomingEdges,
      maxOutgoingEdges,
      dependencyTypes: [...depTypes],
    },
  };
}

function getModuleSize(module: Module<>): number {
  // $FlowFixMe
  const code = module.output[0].data.code;
  return code ? code.length : 0;
}

function generateSizeAccumulator(metroGraph: Graph<>) {
  return (total: number, currentPath: string) =>
    total + getModuleSize(getModule(metroGraph, currentPath));
}

function moduleToNode(module: Module<>, metroGraph: Graph<>): Node {
  const deps = [...module.dependencies.values()].map(d => d.absolutePath);
  const inverseDeps = [...module.inverseDependencies];
  return {
    data: {
      id: module.path,
      label: path.basename(module.path, '.js'),
      deps,
      inverseDeps,
      size: getModuleSize(module),
      depsSize: deps.reduce(generateSizeAccumulator(metroGraph), 0),
      invDepsSize: inverseDeps.reduce(generateSizeAccumulator(metroGraph), 0),
      type: module.output[0].type,
      // $FlowFixMe
      output: module.output[0].data.code,
      // Converting to base64 here avoids having to bundle an extra base64
      // implementation for the browser.
      source: module.getSource().toString('base64'),
    },
  };
}

function createEdge(from: string, to: string, isAsync: boolean) {
  return {
    data: {
      isAsync,
      id: `${from}-${to}`,
      source: from,
      target: to,
    },
  };
}

module.exports = {
  getGraphFromModule,
  getGraphToModule,
  getGraphFromModuleToModule,
  getGraphInfo,
  _addPathToGraph,
  _buildGraphFromModuleToModule,
};
