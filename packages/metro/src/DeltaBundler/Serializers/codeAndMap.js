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

const getAppendScripts = require('../../lib/getAppendScripts');

const {isJsModule, wrapModule, getJsOutput} = require('./helpers/js');
const {fromRawMappings} = require('metro-source-map');

import type {Graph, Module} from '../types.flow';

type Options = {|
  +processModuleFilter: (module: Module<>) => boolean,
  +createModuleId: string => number | string,
  +dev: boolean,
  +getRunModuleStatement: (number | string) => string,
  +projectRoot: string,
  +runBeforeMainModule: $ReadOnlyArray<string>,
  +runModule: boolean,
  +sourceMapUrl: ?string,
  +excludeSource: boolean,
|};

function codeAndMap(
  entryPoint: string,
  pre: $ReadOnlyArray<Module<>>,
  graph: Graph<>,
  options: Options,
): {|code: string, map: string|} {
  for (const module of graph.dependencies.values()) {
    options.createModuleId(module.path);
  }
  const appendedScripts = getAppendScripts(entryPoint, graph, options)
    .filter(isJsModule)
    .filter(options.processModuleFilter);

  const modules = [...pre, ...graph.dependencies.values()]
    .filter(isJsModule)
    .filter(options.processModuleFilter);

  const code = [...modules, ...appendedScripts]
    .map(module => wrapModule(module, options))
    .join('\n');

  const mapModules = modules.map(module => {
    return {
      ...getJsOutput(module).data,
      path: module.path,
      source: options.excludeSource ? '' : module.getSource(),
    };
  });

  const map = fromRawMappings(mapModules).toString(undefined, {
    excludeSource: options.excludeSource,
  });

  return {code, map};
}

module.exports = codeAndMap;
