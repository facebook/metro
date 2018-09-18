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

const {isJsModule, getJsOutput} = require('./helpers/js');
const {fromRawMappings} = require('metro-source-map');

import type {Graph, Module} from '../types.flow';

function fullSourceMap(
  pre: $ReadOnlyArray<Module<>>,
  graph: Graph<>,
  options: {|
    +excludeSource: boolean,
    +processModuleFilter: (module: Module<>) => boolean,
  |},
): string {
  const modules = [...pre, ...graph.dependencies.values()]
    .filter(isJsModule)
    .filter(options.processModuleFilter)
    .map(module => {
      return {
        ...getJsOutput(module).data,
        path: module.path,
        source: options.excludeSource ? '' : getModuleSource(module),
      };
    });

  return fromRawMappings(modules).toString(undefined, {
    excludeSource: options.excludeSource,
  });
}

function getModuleSource(module: Module<>): string {
  if (getJsOutput(module).type === 'js/module/asset') {
    return '';
  }

  return module.getSource().toString();
}

module.exports = fullSourceMap;
