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

const sourceMapGenerator = require('./sourceMapGenerator');

import type {Module} from '../types.flow';
import type {BabelSourceMap} from '@babel/core';

function sourceMapObject(
  modules: $ReadOnlyArray<Module<>>,
  options: {|
    +excludeSource: boolean,
    +processModuleFilter: (module: Module<>) => boolean,
  |},
): BabelSourceMap {
  return sourceMapGenerator(modules, options).toMap(undefined, {
    excludeSource: options.excludeSource,
  });
}

module.exports = sourceMapObject;
