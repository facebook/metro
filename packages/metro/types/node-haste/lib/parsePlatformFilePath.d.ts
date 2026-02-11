/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

type PlatformFilePathParts = {
  dirPath: string;
  baseName: string;
  platform: null | undefined | string;
  extension: null | undefined | string;
};
/**
 * Extract the components of a file path that can have a platform specifier: Ex.
 * `index.ios.js` is specific to the `ios` platform and has the extension `js`.
 */
declare function parsePlatformFilePath(
  filePath: string,
  platforms: ReadonlySet<string>,
): PlatformFilePathParts;
export default parsePlatformFilePath;
