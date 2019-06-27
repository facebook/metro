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

const {
  sourceMapGenerator,
  sourceMapGeneratorNonBlocking,
} = require('./sourceMapGenerator');

import type {Module} from '../types.flow';
import type {BabelSourceMap} from '@babel/core';

function sourceMapObject(
  modules: $ReadOnlyArray<Module<>>,
  options: {|
    +excludeSource: boolean,
    +processModuleFilter: (module: Module<>) => boolean,
  |},
): BabelSourceMap {
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
): Promise<BabelSourceMap> {
  const generator = await sourceMapGeneratorNonBlocking(modules, options);
  return generator.toMap(undefined, {
    excludeSource: options.excludeSource,
  });
}

module.exports = {
  sourceMapObject,
  sourceMapObjectNonBlocking,
};
