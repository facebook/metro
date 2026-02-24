/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<623892927b76c4f68802bb69f19d9974>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/getExplodedSourceMap.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Module} from '../types';
import type {
  FBSourceFunctionMap,
  MetroSourceMapSegmentTuple,
} from 'metro-source-map';

export type ExplodedSourceMap = ReadonlyArray<{
  readonly map: Array<MetroSourceMapSegmentTuple>;
  readonly firstLine1Based: number;
  readonly functionMap: null | undefined | FBSourceFunctionMap;
  readonly path: string;
}>;
export declare function getExplodedSourceMap(
  modules: ReadonlyArray<Module>,
  options: {readonly processModuleFilter: (module: Module) => boolean},
): ExplodedSourceMap;
