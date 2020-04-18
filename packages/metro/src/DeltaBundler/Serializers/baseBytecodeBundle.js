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
const hermesCompiler = require('metro-hermes-compiler');
const processBytecodeModules = require('./helpers/processBytecodeModules');

const {getJsOutput} = require('./helpers/js');

import type {BytecodeBundle} from '../../lib/bundle-modules/types.flow';
import type {
  Graph,
  MixedOutput,
  Module,
  SerializerOptions,
} from '../types.flow';

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

  const postModules = processBytecodeModules(
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
              bytecode: hermesCompiler(getJsOutput(module).data.code, {
                sourceURL: module.path,
              }).bytecode,
            },
          },
        ],
      };
    }),
    processModulesOptions,
  ).map(([module, bytecode]) => bytecode);

  const processedModules = processBytecodeModules(
    [...graph.dependencies.values()],
    processModulesOptions,
  ).map(([module, bytecode]) => [
    options.createModuleId(module.path),
    bytecode,
  ]);

  return {
    pre: preModules.length
      ? Buffer.concat(
          processBytecodeModules(preModules, processModulesOptions).map(
            ([_, bytecode]) => bytecode,
          ),
        )
      : null,
    post: Buffer.concat(postModules),
    modules: processedModules,
  };
}

module.exports = baseBytecodeBundle;
