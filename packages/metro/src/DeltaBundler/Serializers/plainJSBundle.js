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

const {isJsModule, wrapModule} = require('./helpers/js');

import type {ModuleMap} from '../../lib/bundle-modules/types.flow';
import type {Graph, Module, SerializerOptions} from '../types.flow';

type Options =
  | {|
      ...SerializerOptions,
      embedDelta: false,
    |}
  | {|
      ...SerializerOptions,
      embedDelta: true,
      revisionId: string,
    |};

const PRAGMA = '//# offsetTable=';

// TODO(T34761193): This logic is shared across all serializers.
function processModules(
  modules: $ReadOnlyArray<Module<>>,
  {
    filter,
    createModuleId,
    dev,
    projectRoot,
  }: {|
    +filter: (module: Module<>) => boolean,
    +createModuleId: string => number,
    +dev: boolean,
    +projectRoot: string,
  |},
): $ReadOnlyArray<[Module<>, string]> {
  return [...modules]
    .filter(isJsModule)
    .filter(filter)
    .map(module => [
      module,
      wrapModule(module, {
        createModuleId,
        dev,
        projectRoot,
      }),
    ]);
}

function generateSource(
  modules: ModuleMap,
  offset: number,
): [Array<[number, number]>, string] {
  let output = '';
  const table = [];
  for (const [id, code] of modules) {
    table.push([id, code.length]);
    output += code + '\n';
  }
  // Remove the extraneous line break at the end.
  return [table, output.slice(0, -1)];
}

function plainJSBundle(
  entryPoint: string,
  preModules: $ReadOnlyArray<Module<>>,
  graph: Graph<>,
  options: Options,
): string {
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

  const [modules, modulesCode] = generateSource(
    processModules([...graph.dependencies.values()], processModulesOptions)
      .map(([module, code]) => [options.createModuleId(module.path), code])
      // Sorting the modules by id ensures that our build output is
      // deterministic by id. This is necessary for delta bundle clients to be
      // able to re-generate plain js bundles that match the output of this
      // function. Otherwise, source maps wouldn't work properly for delta
      // bundles.
      .sort((a, b) => a[0] - b[0]),
    preCode.length + 1,
  );

  return [
    preCode,
    modulesCode,
    postCode,
    ...(options.embedDelta
      ? [
          PRAGMA +
            JSON.stringify({
              pre: preCode.length,
              post: postCode.length,
              modules,
              revisionId: options.revisionId,
            }),
        ]
      : []),
  ].join('\n');
}

module.exports = plainJSBundle;
