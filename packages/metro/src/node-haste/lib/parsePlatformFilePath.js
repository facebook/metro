/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

'use strict';

const path = require('path');

type PlatformFilePathParts = {
  dirPath: string,
  baseName: string,
  platform: ?string,
  extension: ?string,
};

const PATH_RE = /^(.+?)(\.([^.]+))?\.([^.]+)$/;

/**
 * Extract the components of a file path that can have a platform specifier: Ex.
 * `index.ios.js` is specific to the `ios` platform and has the extension `js`.
 */
function parsePlatformFilePath(
  filePath: string,
  platforms: $ReadOnlySet<string>,
): PlatformFilePathParts {
  const dirPath = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const match = fileName.match(PATH_RE);
  if (!match) {
    return {dirPath, baseName: fileName, platform: null, extension: null};
  }
  const extension = match[4] || null;
  const platform = match[3] || null;
  if (platform == null || platforms.has(platform)) {
    return {dirPath, baseName: match[1], platform, extension};
  }
  const baseName = `${match[1]}.${platform}`;
  return {dirPath, baseName, platform: null, extension};
}

module.exports = parsePlatformFilePath;
