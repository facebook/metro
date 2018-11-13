/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const getAppendScripts = require('../../lib/getAppendScripts');
const processModules = require('./helpers/processModules');

import type {Graph, Module, SerializerOptions} from '../types.flow';

function baseJSBundle(
  entryPoint: string,
  preModules: $ReadOnlyArray<Module<>>,
  graph: Graph<>,
  options: SerializerOptions,
): {|+pre: string, +post: string, +modules: $ReadOnlyArray<[number, string]>|} {
  for (const module of graph.dependencies.values()) {
    options.createModuleId(module.path);
  }

  const processModulesOptions = {
    filter: options.processModuleFilter,
    createModuleId: options.createModuleId,
    dev: options.dev,
    projectRoot: options.projectRoot,
  };

  const preCode = processModules(preModules, processModulesOptions)
    .map(([_, code]) => code)
    .join('\n');

  const postCode = processModules(
    getAppendScripts(entryPoint, preModules, graph, {
      createModuleId: options.createModuleId,
      getRunModuleStatement: options.getRunModuleStatement,
      runBeforeMainModule: options.runBeforeMainModule,
      runModule: options.runModule,
      sourceMapUrl: options.sourceMapUrl,
      inlineSourceMap: options.inlineSourceMap,
    }),
    processModulesOptions,
  )
    .map(([_, code]) => code)
    .join('\n');

  return {
    pre: preCode,
    post: postCode,
    modules: processModules(
      [...graph.dependencies.values()],
      processModulesOptions,
    ).map(([module, code]) => [options.createModuleId(module.path), code]),
  };
}

module.exports = baseJSBundle;
