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

import type {Graph} from '../../DeltaCalculator';

function getTransitiveDependencies(path: string, graph: Graph): Set<string> {
  const dependencies = _getDeps(path, graph, new Set());

  // Remove the main entry point, since this method only returns the
  // dependencies.
  dependencies.delete(path);

  return dependencies;
}

function _getDeps(path: string, graph: Graph, deps: Set<string>): Set<string> {
  if (deps.has(path)) {
    return deps;
  }

  const module = graph.dependencies.get(path);

  if (!module) {
    return deps;
  }

  deps.add(path);

  for (const dependencyPath of module.dependencies.values()) {
    _getDeps(dependencyPath, graph, deps);
  }

  return deps;
}

module.exports = getTransitiveDependencies;
