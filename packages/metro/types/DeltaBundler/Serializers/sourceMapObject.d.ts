/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<cb907f1a9aa40efd505a19826a21be6d>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/sourceMapObject.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
