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

const crypto = require('crypto');
const denodeify = require('denodeify');
const fs = require('fs');
const imageSize = require('image-size');
const path = require('path');
const toLocalPath = require('../node-haste/lib/toLocalPath');

const {isAssetTypeAnImage} = require('../Bundler/util');
const {findRoot, getAbsoluteAssetRecord, hashFiles} = require('./util');

type AssetInfo = {|
  files: Array<string>,
  hash: string,
  name: string,
  scales: Array<number>,
  type: string,
|};

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
  _hashes: Map<?string, string>;
  _files: Map<string, string>;

  constructor(options: {|+projectRoots: $ReadOnlyArray<string>|}) {
    this._roots = options.projectRoots;
    this._hashes = new Map();
    this._files = new Map();
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
    const nameData = AssetPaths.parse(
      assetPath,
      new Set(platform != null ? [platform] : []),
    );
    const {name, type} = nameData;

    const {scales, files} = await this._getAssetRecord(assetPath, platform);

    const hash = this._hashes.get(assetPath);
    if (hash != null) {
      return {files, hash, name, scales, type};
    }

    const hasher = crypto.createHash('md5');

    if (files.length > 0) {
      await hashFiles(files.slice(), hasher);
    }

    const freshHash = hasher.digest('hex');
    this._hashes.set(assetPath, freshHash);
    files.forEach(f => this._files.set(f, assetPath));
    return {files, hash: freshHash, name, scales, type};
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
    const assetData = await this._getAssetInfo(localPath, platform);
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

  onFileChange(type: string, filePath: string) {
    this._hashes.delete(this._files.get(filePath));
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
