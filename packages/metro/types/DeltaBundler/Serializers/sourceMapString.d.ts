/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<578dd38524928420df15b0aba8f32e77>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/sourceMapString.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
