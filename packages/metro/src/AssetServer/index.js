/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const AssetPaths = require('../node-haste/lib/AssetPaths');

const denodeify = require('denodeify');
const fs = require('fs');
const imageSize = require('image-size');
const path = require('path');
const toLocalPath = require('../node-haste/lib/toLocalPath');

const {isAssetTypeAnImage} = require('../Bundler/util');
const {
  findRoot,
  getAbsoluteAssetInfo,
  getAbsoluteAssetRecord,
} = require('./util');

import type {AssetInfo} from './util';

export type AssetData = {|
  __packager_asset: boolean,
  fileSystemLocation: string,
  httpServerLocation: string,
  width: ?number,
  height: ?number,
  scales: Array<number>,
  files: Array<string>,
  hash: string,
  name: string,
  type: string,
|};

const readFile = denodeify(fs.readFile);

class AssetServer {
  _roots: $ReadOnlyArray<string>;

  constructor(options: {|+projectRoots: $ReadOnlyArray<string>|}) {
    this._roots = options.projectRoots;
  }

  get(assetPath: string, platform: ?string = null): Promise<Buffer> {
    const assetData = AssetPaths.parse(
      assetPath,
      new Set(platform != null ? [platform] : []),
    );
    return this._getAssetRecord(assetPath, platform).then(record => {
      for (let i = 0; i < record.scales.length; i++) {
        if (record.scales[i] >= assetData.resolution) {
          return readFile(record.files[i]);
        }
      }

      return readFile(record.files[record.files.length - 1]);
    });
  }

  async _getAssetInfo(
    assetPath: string,
    platform: ?string = null,
  ): Promise<AssetInfo> {
    const dir = await findRoot(this._roots, path.dirname(assetPath), assetPath);

    const assetAbsolutePath = path.join(dir, path.basename(assetPath));

    return await getAbsoluteAssetInfo(assetAbsolutePath, platform);
  }

  async getAssetData(
    assetPath: string,
    platform: ?string = null,
  ): Promise<AssetData> {
    const localPath = toLocalPath(this._roots, assetPath);
    var assetUrlPath = path.join('/assets', path.dirname(localPath));

    // On Windows, change backslashes to slashes to get proper URL path from file path.
    if (path.sep === '\\') {
      assetUrlPath = assetUrlPath.replace(/\\/g, '/');
    }

    const isImage = isAssetTypeAnImage(path.extname(assetPath).slice(1));
    const assetData = await getAbsoluteAssetInfo(assetPath, platform);
    const dimensions = isImage ? imageSize(assetData.files[0]) : null;
    const scale = assetData.scales[0];

    return {
      __packager_asset: true,
      fileSystemLocation: path.dirname(assetPath),
      httpServerLocation: assetUrlPath,
      width: dimensions ? dimensions.width / scale : undefined,
      height: dimensions ? dimensions.height / scale : undefined,
      scales: assetData.scales,
      files: assetData.files,
      hash: assetData.hash,
      name: assetData.name,
      type: assetData.type,
    };
  }

  /**
   * Given a request for an image by path. That could contain a resolution
   * postfix, we need to find that image (or the closest one to it's resolution)
   * in one of the project roots:
   *
   * 1. We first parse the directory of the asset
   * 2. We check to find a matching directory in one of the project roots
   * 3. We then build a map of all assets and their scales in this directory
   * 4. Then try to pick platform-specific asset records
   * 5. Then pick the closest resolution (rounding up) to the requested one
   */
  async _getAssetRecord(
    assetPath: string,
    platform: ?string = null,
  ): Promise<{|
    files: Array<string>,
    scales: Array<number>,
  |}> {
    const dir = await findRoot(this._roots, path.dirname(assetPath), assetPath);

    return await getAbsoluteAssetRecord(
      path.join(dir, path.basename(assetPath)),
      platform,
    );
  }
}

module.exports = AssetServer;
