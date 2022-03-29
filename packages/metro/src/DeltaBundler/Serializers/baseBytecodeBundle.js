/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

import type {
  Graph,
  MixedOutput,
  Module,
  SerializerOptions,
} from '../types.flow';
import type {BytecodeBundle} from 'metro-runtime/src/modules/types.flow';

const getAppendScripts = require('../../lib/getAppendScripts');
const {getJsOutput} = require('./helpers/js');
const processBytecodeModules = require('./helpers/processBytecodeModules');
const {compile} = require('metro-hermes-compiler');

function baseBytecodeBundle(
  entryPoint: string,
  preModules: $ReadOnlyArray<Module<>>,
  graph: Graph<>,
  options: SerializerOptions,
): BytecodeBundle {
  for (const module of graph.dependencies.values()) {
    options.createModuleId(module.path);
  }

  const processModulesOptions = {
    filter: options.processModuleFilter,
    createModuleId: options.createModuleId,
    dev: options.dev,
    projectRoot: options.projectRoot,
  };

  // Do not prepend polyfills or the require runtime when only modules are requested
  if (options.modulesOnly) {
    preModules = [];
  }

  const modules = [...graph.dependencies.values()].sort(
    (a: Module<MixedOutput>, b: Module<MixedOutput>) =>
      options.createModuleId(a.path) - options.createModuleId(b.path),
  );

  const post = processBytecodeModules(
    getAppendScripts(
      entryPoint,
      [...preModules, ...modules],
      graph.importBundleNames,
      {
        asyncRequireModulePath: options.asyncRequireModulePath,
        createModuleId: options.createModuleId,
        getRunModuleStatement: options.getRunModuleStatement,
        inlineSourceMap: options.inlineSourceMap,
        projectRoot: options.projectRoot,
        runBeforeMainModule: options.runBeforeMainModule,
        runModule: options.runModule,
        serverRoot: options.serverRoot,
        sourceMapUrl: options.sourceMapUrl,
        sourceUrl: options.sourceUrl,
      },
    ).map(module => {
      return {
        ...module,
        output: [
          ...module.output,
          {
            type: 'bytecode/script/virtual',
            data: {
              bytecode: compile(getJsOutput(module).data.code, {
                sourceURL: module.path,
              }).bytecode,
            },
          },
        ],
      };
    }),
    processModulesOptions,
  ).flatMap(([module, bytecodeBundle]) => bytecodeBundle);

  const processedModules = processBytecodeModules(
    [...graph.dependencies.values()],
    processModulesOptions,
  ).map(([module, bytecodeBundle]) => [
    options.createModuleId(module.path),
    bytecodeBundle,
  ]);

  return {
    pre: processBytecodeModules(preModules, processModulesOptions).flatMap(
      ([_, bytecodeBundle]) => bytecodeBundle,
    ),
    post,
    modules: processedModules,
  };
}

module.exports = baseBytecodeBundle;
