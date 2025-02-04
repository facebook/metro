/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {
  BuildParameters,
  CacheData,
  CacheManager,
  CacheManagerFactoryOptions,
  CacheManagerWriteOptions,
} from '../flow-types';

import rootRelativeCacheKeys from '../lib/rootRelativeCacheKeys';
import {promises as fsPromises} from 'fs';
import {tmpdir} from 'os';
import path from 'path';
import {deserialize, serialize} from 'v8';

type DiskCacheConfig = {
  cacheFilePrefix?: ?string,
  cacheDirectory?: ?string,
};

const DEFAULT_PREFIX = 'metro-file-map';
const DEFAULT_DIRECTORY = tmpdir();

export class DiskCacheManager implements CacheManager {
  _cachePath: string;

  constructor(
    {buildParameters}: CacheManagerFactoryOptions,
    {cacheDirectory, cacheFilePrefix}: DiskCacheConfig,
  ) {
    this._cachePath = DiskCacheManager.getCacheFilePath(
      buildParameters,
      cacheFilePrefix,
      cacheDirectory,
    );
  }

  static getCacheFilePath(
    buildParameters: BuildParameters,
    cacheFilePrefix?: ?string,
    cacheDirectory?: ?string,
  ): string {
    const {rootDirHash, relativeConfigHash} =
      rootRelativeCacheKeys(buildParameters);

    return path.join(
      cacheDirectory ?? DEFAULT_DIRECTORY,
      `${
        cacheFilePrefix ?? DEFAULT_PREFIX
      }-${rootDirHash}-${relativeConfigHash}`,
    );
  }

  getCacheFilePath(): string {
    return this._cachePath;
  }

  async read(): Promise<?CacheData> {
    try {
      return deserialize(await fsPromises.readFile(this._cachePath));
    } catch (e) {
      if (e?.code === 'ENOENT') {
        // Cache file not found - not considered an error.
        return null;
      }
      // Rethrow anything else.
      throw e;
    }
  }

  async write(
    getSnapshot: () => CacheData,
    {changedSinceCacheRead}: CacheManagerWriteOptions,
  ): Promise<void> {
    if (changedSinceCacheRead) {
      await fsPromises.writeFile(this._cachePath, serialize(getSnapshot()));
    }
  }
}
