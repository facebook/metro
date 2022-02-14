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
import type {MixedSourceMap} from 'metro-source-map';

const {
  sourceMapGenerator,
  sourceMapGeneratorNonBlocking,
} = require('./sourceMapGenerator');

function sourceMapObject(
  modules: $ReadOnlyArray<Module<>>,
  options: {|
    +excludeSource: boolean,
    +processModuleFilter: (module: Module<>) => boolean,
  |},
): MixedSourceMap {
  const generator = sourceMapGenerator(modules, options);
  return generator.toMap(undefined, {
    excludeSource: options.excludeSource,
  });
}

async function sourceMapObjectNonBlocking(
  modules: $ReadOnlyArray<Module<>>,
  options: {|
    +excludeSource: boolean,
    +processModuleFilter: (module: Module<>) => boolean,
  |},
): Promise<MixedSourceMap> {
  const generator = await sourceMapGeneratorNonBlocking(modules, options);
  return generator.toMap(undefined, {
    excludeSource: options.excludeSource,
  });
}

module.exports = {
  sourceMapObject,
  sourceMapObjectNonBlocking,
};
