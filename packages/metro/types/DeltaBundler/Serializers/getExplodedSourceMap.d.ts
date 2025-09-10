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
