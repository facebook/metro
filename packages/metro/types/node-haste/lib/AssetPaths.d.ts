/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
