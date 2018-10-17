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
): Map<number, string> {
  return new Map(
    [...modules]
      .filter(isJsModule)
      .filter(filter)
      .map(module => [
        createModuleId(module.path),
        wrapModule(module, {
          createModuleId,
          dev,
          projectRoot,
        }),
      ]),
  );
}

function generateSource(
  map: Map<number, string>,
  offset: number,
): [Array<[number, number, number]>, string] {
  let output = '';
  const table = [];
  for (const [id, code] of map.entries()) {
    // TODO(T34761233): The offset is redundant since we can retrieve it from
    // the sum of the lengths of all previous modules.
    table.push([id, offset + output.length, code.length]);
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

  let i = -1;
  const [pre, preCode] = generateSource(
    processModules(preModules, {
      ...processModulesOptions,
      createModuleId: () => i--,
    }),
    0,
  );
  const [delta, deltaCode] = generateSource(
    processModules([...graph.dependencies.values()], processModulesOptions),
    preCode.length + 1,
  );
  const [post, postCode] = generateSource(
    processModules(
      getAppendScripts(entryPoint, preModules, graph, {
        createModuleId: options.createModuleId,
        getRunModuleStatement: options.getRunModuleStatement,
        runBeforeMainModule: options.runBeforeMainModule,
        runModule: options.runModule,
        sourceMapUrl: options.sourceMapUrl,
        inlineSourceMap: options.inlineSourceMap,
      }),
      processModulesOptions,
    ),
    preCode.length + deltaCode.length + 2,
  );

  return [
    preCode,
    deltaCode,
    postCode,
    ...(options.embedDelta
      ? [PRAGMA + JSON.stringify({pre, delta, post, id: options.revisionId})]
      : []),
  ].join('\n');
}

module.exports = plainJSBundle;
