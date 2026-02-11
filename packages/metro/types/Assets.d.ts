/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

export type AssetInfo = {
  readonly files: Array<string>;
  readonly hash: string;
  readonly name: string;
  readonly scales: Array<number>;
  readonly type: string;
};
export type AssetDataWithoutFiles = {
  readonly __packager_asset: boolean;
  readonly fileSystemLocation: string;
  readonly hash: string;
  readonly height: null | undefined | number;
  readonly httpServerLocation: string;
  readonly name: string;
  readonly scales: Array<number>;
  readonly type: string;
  readonly width: null | undefined | number;
};
export type AssetDataFiltered = {
  readonly __packager_asset: boolean;
  readonly hash: string;
  readonly height: null | undefined | number;
  readonly httpServerLocation: string;
  readonly name: string;
  readonly scales: Array<number>;
  readonly type: string;
  readonly width: null | undefined | number;
};
export declare function isAssetTypeAnImage(type: string): boolean;
export declare function getAssetSize(
  type: string,
  content: Buffer,
  filePath: string,
): null | undefined | {readonly width: number; readonly height: number};
export type AssetData = AssetDataWithoutFiles & {
  readonly files: Array<string>;
};
export type AssetDataPlugin = (
  assetData: AssetData,
) => AssetData | Promise<AssetData>;
export declare function getAssetData(
  assetPath: string,
  localPath: string,
  assetDataPlugins: ReadonlyArray<string>,
  platform: null | undefined | string,
  publicPath: string,
): Promise<AssetData>;
/**
 * Returns all the associated files (for different resolutions) of an asset.
 **/
export declare function getAssetFiles(
  assetPath: string,
  platform?: null | undefined | string,
): Promise<Array<string>>;
/**
 * Return a buffer with the actual image given a request for an image by path.
 * The relativePath can contain a resolution postfix, in this case we need to
 * find that image (or the closest one to it's resolution) in one of the
 * project roots:
 *
 * 1. We first parse the directory of the asset
 * 2. We then build a map of all assets and their scales in this directory
 * 3. Then try to pick platform-specific asset records
 * 4. Then pick the closest resolution (rounding up) to the requested one
 */
export declare function getAsset(
  relativePath: string,
  projectRoot: string,
  watchFolders: ReadonlyArray<string>,
  platform: null | undefined | string,
  assetExts: ReadonlyArray<string>,
  fileExistsInFileMap?: (absolutePath: string) => boolean,
): Promise<Buffer>;
