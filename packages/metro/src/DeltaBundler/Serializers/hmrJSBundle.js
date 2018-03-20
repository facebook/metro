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

const addParamsToDefineCall = require('../../lib/addParamsToDefineCall');

const {wrapModule} = require('./helpers/js');

import type {Delta, Graph} from '../';
import type {DependencyEdge} from '../traverseDependencies';

type Options = {
  createModuleId: string => number,
};

export type Result = {
  type: string,
  body: {
    modules: $ReadOnlyArray<{|+id: number, +code: string|}>,
    sourceURLs: {},
    sourceMappingURLs: {},
  },
};

function hmrJSBundle(delta: Delta, graph: Graph, options: Options): Result {
  const modules = [];

  for (const module of delta.modified.values()) {
    modules.push(_prepareModule(module, graph, options));
  }

  return {
    type: 'update',
    body: {
      modules,
      sourceURLs: {},
      sourceMappingURLs: {}, // TODO: handle Source Maps
    },
  };
}

function _prepareModule(
  module: DependencyEdge,
  graph: Graph,
  options: Options,
): {|+id: number, +code: string|} {
  const code = wrapModule(module, {
    createModuleId: options.createModuleId,
    dev: true,
  });

  const inverseDependencies = _getInverseDependencies(module.path, graph);

  // Transform the inverse dependency paths to ids.
  const inverseDependenciesById = Object.create(null);
  Object.keys(inverseDependencies).forEach(path => {
    inverseDependenciesById[options.createModuleId(path)] = inverseDependencies[
      path
    ].map(options.createModuleId);
  });

  return {
    id: options.createModuleId(module.path),
    code: addParamsToDefineCall(code, inverseDependenciesById),
  };
}

/**
 * Instead of adding the whole inverseDependncies object into each changed
 * module (which can be really huge if the dependency graph is big), we only
 * add the needed inverseDependencies for each changed module (we do this by
 * traversing upwards the dependency graph).
 */
function _getInverseDependencies(
  path: string,
  graph: Graph,
  inverseDependencies: {[key: string]: Array<string>} = {},
): {[key: string]: Array<string>} {
  // Dependency alredy traversed.
  if (path in inverseDependencies) {
    return inverseDependencies;
  }

  const module = graph.dependencies.get(path);
  if (!module) {
    return inverseDependencies;
  }

  inverseDependencies[path] = [];

  for (const inverse of module.inverseDependencies) {
    inverseDependencies[path].push(inverse);

    _getInverseDependencies(inverse, graph, inverseDependencies);
  }

  return inverseDependencies;
}

module.exports = hmrJSBundle;
