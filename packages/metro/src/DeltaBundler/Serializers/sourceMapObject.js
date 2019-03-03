/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const getSourceMapInfo = require('./helpers/getSourceMapInfo');

const {isJsModule} = require('./helpers/js');
const {fromRawMappings} = require('metro-source-map');

import type {Graph, Module} from '../types.flow';
import type {BabelSourceMap} from '@babel/core';

function fullSourceMapObject(
  pre: $ReadOnlyArray<Module<>>,
  graph: Graph<>,
  options: {|
    +excludeSource: boolean,
    +processModuleFilter: (module: Module<>) => boolean,
  |},
): BabelSourceMap {
  const modules = [...pre, ...graph.dependencies.values()]
    .filter(isJsModule)
    .filter(options.processModuleFilter)
    .map(module =>
      getSourceMapInfo(module, {excludeSource: options.excludeSource}),
    );

  return fromRawMappings(modules).toMap(undefined, {
    excludeSource: options.excludeSource,
  });
}

module.exports = fullSourceMapObject;
