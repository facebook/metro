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

import type {Module} from '../types.flow';

type ReturnType<F> = $Call<<A, R>((...A) => R) => R, F>;

function sourceMapGenerator(
  modules: $ReadOnlyArray<Module<>>,
  options: {|
    +excludeSource: boolean,
    +processModuleFilter: (module: Module<>) => boolean,
  |},
): ReturnType<typeof fromRawMappings> {
  const sourceMapInfos = modules
    .filter(isJsModule)
    .filter(options.processModuleFilter)
    .map((module: Module<>) =>
      getSourceMapInfo(module, {excludeSource: options.excludeSource}),
    );
  return fromRawMappings(sourceMapInfos);
}

module.exports = sourceMapGenerator;
