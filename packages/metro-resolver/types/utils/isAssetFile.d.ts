/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
