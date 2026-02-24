/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<ef11437df6220e26b38eae0d8fb2c3d1>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/utils/isAssetFile.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

/**
 * Determine if a file path should be considered an asset file based on the
 * given `assetExts`.
 */
declare function isAssetFile(
  filePath: string,
  assetExts: ReadonlySet<string>,
): boolean;
export default isAssetFile;
