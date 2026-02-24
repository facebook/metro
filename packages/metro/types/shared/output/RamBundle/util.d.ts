/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<cb3371e2f23da9cd30e08ed76ec4f7db>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/shared/output/RamBundle/util.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
