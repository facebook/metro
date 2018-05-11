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

const {isJsModule, getJsOutput} = require('./helpers/js');
const {fromRawMappings} = require('metro-source-map');

import type {Graph, Module} from '../types.flow';
import type {BabelSourceMap} from '@babel/core';

function fullSourceMapObject(
  pre: $ReadOnlyArray<Module<>>,
  graph: Graph<>,
  options: {|+excludeSource: boolean|},
): BabelSourceMap {
  const modules = [...pre, ...graph.dependencies.values()]
    .filter(isJsModule)
    .map(module => {
      return {
        ...getJsOutput(module).data,
        path: module.path,
        source: options.excludeSource ? '' : module.getSource(),
      };
    });

  return fromRawMappings(modules).toMap(undefined, {
    excludeSource: options.excludeSource,
  });
}

module.exports = fullSourceMapObject;
