/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {
  BuildParameters,
  CacheManager,
  FileData,
  InternalData,
} from '../flow-types';

import rootRelativeCacheKeys from '../lib/rootRelativeCacheKeys';
import {readFileSync, writeFileSync} from 'graceful-fs';
import {tmpdir} from 'os';
import path from 'path';
// $FlowFixMe[missing-export] - serialize and deserialize missing typedefs
import {deserialize, serialize} from 'v8';

type DiskCacheConfig = {
  buildParameters: BuildParameters,
  cacheFilePrefix?: ?string,
  cacheDirectory?: ?string,
};

const DEFAULT_PREFIX = 'metro-file-map';
const DEFAULT_DIRECTORY = tmpdir();

export class DiskCacheManager implements CacheManager {
  _cachePath: string;

  constructor({
    buildParameters,
    cacheDirectory,
    cacheFilePrefix,
  }: DiskCacheConfig) {
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

  async read(): Promise<?InternalData> {
    try {
      return deserialize(readFileSync(this._cachePath));
    } catch {}
    return null;
  }

  async write(
    dataSnapshot: InternalData,
    {changed, removed}: $ReadOnly<{changed: FileData, removed: FileData}>,
  ): Promise<void> {
    if (changed.size > 0 || removed.size > 0) {
      writeFileSync(this._cachePath, serialize(dataSnapshot));
    }
  }
}
