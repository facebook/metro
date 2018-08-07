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

const {isJsModule, wrapModule} = require('./helpers/js');

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
|};

function plainJSBundle(
  entryPoint: string,
  pre: $ReadOnlyArray<Module<>>,
  graph: Graph<>,
  options: Options,
): string {
  for (const module of graph.dependencies.values()) {
    options.createModuleId(module.path);
  }

  return [
    ...pre,
    ...graph.dependencies.values(),
    ...getAppendScripts(entryPoint, graph, options),
  ]
    .filter(isJsModule)
    .filter(options.processModuleFilter)
    .map(module => wrapModule(module, options))
    .join('\n');
}

module.exports = plainJSBundle;
