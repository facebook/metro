/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<31b3384bffa191e4c3c9916d93df8571>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/node-haste/lib/AssetPaths.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

export type AssetPath = {
  assetName: string;
  name: string;
  platform: null | undefined | string;
  resolution: number;
  type: string;
};
/**
 * Return `null` if the `filePath` doesn't have a valid extension, required
 * to describe the type of an asset.
 */
export declare function tryParse(
  filePath: string,
  platforms: ReadonlySet<string>,
): null | undefined | AssetPath;
export declare function parse(
  filePath: string,
  platforms: ReadonlySet<string>,
): AssetPath;
