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

declare function sourceMapString(
  modules: ReadonlyArray<Module>,
  options: SourceMapGeneratorOptions,
): string;
declare function sourceMapStringNonBlocking(
  modules: ReadonlyArray<Module>,
  options: SourceMapGeneratorOptions,
): Promise<string>;
export {sourceMapString, sourceMapStringNonBlocking};
