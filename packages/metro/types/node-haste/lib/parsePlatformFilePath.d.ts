/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<61c16b5ef31517dc44347558a4dd431a>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/node-haste/lib/parsePlatformFilePath.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
