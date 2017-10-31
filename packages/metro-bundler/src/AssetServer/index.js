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

import type {AssetPath} from '../node-haste/lib/AssetPaths';

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

const stat = denodeify(fs.stat);
const readDir = denodeify(fs.readdir);
const readFile = denodeify(fs.readFile);

class AssetServer {
  _roots: $ReadOnlyArray<string>;
  _assetExts: $ReadOnlyArray<string>;
  _hashes: Map<?string, string>;
  _files: Map<string, string>;

  constructor(options: {|
    +assetExts: $ReadOnlyArray<string>,
    +projectRoots: $ReadOnlyArray<string>,
  |}) {
    this._roots = options.projectRoots;
    this._assetExts = options.assetExts;
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

  _getAssetInfo(
    assetPath: string,
    platform: ?string = null,
  ): Promise<AssetInfo> {
    const nameData = AssetPaths.parse(
      assetPath,
      new Set(platform != null ? [platform] : []),
    );
    const {name, type} = nameData;

    return this._getAssetRecord(assetPath, platform).then(record => {
      const {scales, files} = record;

      const hash = this._hashes.get(assetPath);
      if (hash != null) {
        return {files, hash, name, scales, type};
      }

      return new Promise((resolve, reject) => {
        const hasher = crypto.createHash('md5');
        hashFiles(files.slice(), hasher, error => {
          if (error) {
            reject(error);
          } else {
            const freshHash = hasher.digest('hex');
            this._hashes.set(assetPath, freshHash);
            files.forEach(f => this._files.set(f, assetPath));
            resolve({files, hash: freshHash, name, scales, type});
          }
        });
      });
    });
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
  _getAssetRecord(
    assetPath: string,
    platform: ?string = null,
  ): Promise<{|
    files: Array<string>,
    scales: Array<number>,
  |}> {
    const filename = path.basename(assetPath);

    return this._findRoot(this._roots, path.dirname(assetPath), assetPath)
      .then(dir => Promise.all([dir, readDir(dir)]))
      .then(res => {
        const dir = res[0];
        const files = res[1];
        const assetData = AssetPaths.parse(
          filename,
          new Set(platform != null ? [platform] : []),
        );

        const map = this._buildAssetMap(dir, files, platform);

        let record;
        if (platform != null) {
          record =
            map.get(getAssetKey(assetData.assetName, platform)) ||
            map.get(assetData.assetName);
        } else {
          record = map.get(assetData.assetName);
        }

        if (!record) {
          throw new Error(
            /* $FlowFixMe: platform can be null */
            `Asset not found: ${assetPath} for platform: ${platform}`,
          );
        }

        return record;
      });
  }

  _findRoot(
    roots: $ReadOnlyArray<string>,
    dir: string,
    debugInfoFile: string,
  ): Promise<string> {
    return Promise.all(
      roots.map(root => {
        const absRoot = path.resolve(root);
        // important: we want to resolve root + dir
        // to ensure the requested path doesn't traverse beyond root
        const absPath = path.resolve(root, dir);

        return stat(absPath).then(
          fstat => {
            // keep asset requests from traversing files
            // up from the root (e.g. ../../../etc/hosts)
            if (!absPath.startsWith(absRoot)) {
              return {path: absPath, isValid: false};
            }
            return {path: absPath, isValid: fstat.isDirectory()};
          },
          _ => {
            return {path: absPath, isValid: false};
          },
        );
      }),
    ).then(stats => {
      for (let i = 0; i < stats.length; i++) {
        if (stats[i].isValid) {
          return stats[i].path;
        }
      }

      const rootsString = roots.map(s => `'${s}'`).join(', ');
      throw new Error(
        `'${debugInfoFile}' could not be found, because '${dir}' is not a ` +
          `subdirectory of any of the roots  (${rootsString})`,
      );
    });
  }

  _buildAssetMap(
    dir: string,
    files: $ReadOnlyArray<string>,
    platform: ?string,
  ): Map<
    string,
    {|
      files: Array<string>,
      scales: Array<number>,
    |},
  > {
    const platforms = new Set(platform != null ? [platform] : []);
    const assets = files.map(this._getAssetDataFromName.bind(this, platforms));
    const map = new Map();
    assets.forEach(function(asset, i) {
      if (asset == null) {
        return;
      }
      const file = files[i];
      const assetKey = getAssetKey(asset.assetName, asset.platform);
      let record = map.get(assetKey);
      if (!record) {
        record = {
          scales: [],
          files: [],
        };
        map.set(assetKey, record);
      }

      let insertIndex;
      const length = record.scales.length;

      for (insertIndex = 0; insertIndex < length; insertIndex++) {
        if (asset.resolution < record.scales[insertIndex]) {
          break;
        }
      }
      record.scales.splice(insertIndex, 0, asset.resolution);
      record.files.splice(insertIndex, 0, path.join(dir, file));
    });

    return map;
  }

  _getAssetDataFromName(platforms: Set<string>, file: string): ?AssetPath {
    return AssetPaths.tryParse(file, platforms);
  }
}

function getAssetKey(assetName, platform) {
  if (platform != null) {
    return `${assetName} : ${platform}`;
  } else {
    return assetName;
  }
}

function hashFiles(files, hash, callback) {
  if (!files.length) {
    callback(null);
    return;
  }

  fs
    .createReadStream(files.shift())
    .on('data', data => hash.update(data))
    .once('end', () => hashFiles(files, hash, callback))
    .once('error', error => callback(error));
}

module.exports = AssetServer;
