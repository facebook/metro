/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {Module} from '../types';
import type {SourceMapGeneratorOptions} from './sourceMapGenerator';
import type {MixedSourceMap} from 'metro-source-map';

declare function sourceMapObject(
  modules: ReadonlyArray<Module>,
  options: SourceMapGeneratorOptions,
): MixedSourceMap;
declare function sourceMapObjectNonBlocking(
  modules: ReadonlyArray<Module>,
  options: SourceMapGeneratorOptions,
): Promise<MixedSourceMap>;
export {sourceMapObject, sourceMapObjectNonBlocking};
