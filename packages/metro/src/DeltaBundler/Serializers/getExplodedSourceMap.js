/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

import type {Module} from '../types.flow';
import type {
  FBSourceFunctionMap,
  MetroSourceMapSegmentTuple,
} from 'metro-source-map';

const {getJsOutput, isJsModule} = require('./helpers/js');

export type ExplodedSourceMap = $ReadOnlyArray<{|
  +map: Array<MetroSourceMapSegmentTuple>,
  +firstLine1Based: number,
  +functionMap: ?FBSourceFunctionMap,
  +path: string,
|}>;

function getExplodedSourceMap(
  modules: $ReadOnlyArray<Module<>>,
  options: {|
    +processModuleFilter: (module: Module<>) => boolean,
  |},
): ExplodedSourceMap {
  const modulesToProcess = modules
    .filter(isJsModule)
    .filter(options.processModuleFilter);

  const result = [];
  let firstLine1Based = 1;

  for (const module of modulesToProcess) {
    const {path} = module;
    const {lineCount, functionMap, map} = getJsOutput(module).data;
    result.push({firstLine1Based, functionMap, path, map});
    firstLine1Based += lineCount;
  }
  return result;
}

module.exports = {
  getExplodedSourceMap,
};
