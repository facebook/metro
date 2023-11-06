/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

'use strict';

import type {Module} from '../types.flow';
import type {SourceMapGeneratorOptions} from './sourceMapGenerator';

const {sourceMapGenerator} = require('./sourceMapGenerator');

function sourceMapString(
  modules: $ReadOnlyArray<Module<>>,
  options: SourceMapGeneratorOptions,
): string {
  return sourceMapGenerator(modules, options).toString(undefined, {
    excludeSource: options.excludeSource,
  });
}

module.exports = sourceMapString;
