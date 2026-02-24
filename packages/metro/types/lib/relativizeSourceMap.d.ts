/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<5282fe2c42baa79f957ef2a40bec560b>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/relativizeSourceMap.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {MixedSourceMap} from 'metro-source-map';

declare function relativizeSourceMapInline(
  sourceMap: MixedSourceMap,
  sourcesRoot: string,
): void;
export default relativizeSourceMapInline;
