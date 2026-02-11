/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {ModuleGroups, ModuleTransportLike} from '../../types';
import type {BasicSourceMap, IndexMap} from 'metro-source-map';

import countLines from '../../../lib/countLines';

declare function lineToLineSourceMap(
  source: string,
  filename?: string,
): BasicSourceMap;
type CombineOptions = {fixWrapperOffset: boolean};
declare function combineSourceMaps(
  modules: ReadonlyArray<ModuleTransportLike>,
  moduleGroups?: ModuleGroups,
  options?: null | undefined | CombineOptions,
): IndexMap;
declare function combineSourceMapsAddingOffsets(
  modules: ReadonlyArray<ModuleTransportLike>,
  x_metro_module_paths: Array<string>,
  moduleGroups?: null | undefined | ModuleGroups,
  options?: null | undefined | CombineOptions,
): IndexMap;
declare const joinModules: (
  modules: ReadonlyArray<{readonly code: string}>,
) => string;
export {
  combineSourceMaps,
  combineSourceMapsAddingOffsets,
  countLines,
  joinModules,
  lineToLineSourceMap,
};
