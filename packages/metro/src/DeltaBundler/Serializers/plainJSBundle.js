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

function plainJSBundle(
  entryPoint: string,
  pre: $ReadOnlyArray<Module<>>,
  graph: Graph<>,
  options: SerializerOptions,
): string {
  for (const module of graph.dependencies.values()) {
    options.createModuleId(module.path);
  }

  return [
    ...pre,
    ...graph.dependencies.values(),
    ...getAppendScripts(entryPoint, pre, graph, options),
  ]
    .filter(isJsModule)
    .filter(options.processModuleFilter)
    .map(module => wrapModule(module, options))
    .join('\n');
}

module.exports = plainJSBundle;
