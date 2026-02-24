/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<bf83602f3e958b1e38787cb0c322993f>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-source-map/src/composeSourceMaps.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {MixedSourceMap} from './source-map';

declare function composeSourceMaps(
  maps: ReadonlyArray<MixedSourceMap>,
): MixedSourceMap;
export default composeSourceMaps;
