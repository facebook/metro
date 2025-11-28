/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
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

type AutoSaveOptions = Readonly<{debounceMs: number}>;
type DiskCacheConfig = Readonly<{
  autoSave?: Partial<AutoSaveOptions> | boolean;
  cacheFilePrefix?: null | undefined | string;
  cacheDirectory?: null | undefined | string;
}>;
export declare class DiskCacheManager implements CacheManager {
  constructor(
    factoryOptions: CacheManagerFactoryOptions,
    config: DiskCacheConfig,
  );
  static getCacheFilePath(
    buildParameters: BuildParameters,
    cacheFilePrefix?: null | undefined | string,
    cacheDirectory?: null | undefined | string,
  ): string;
  getCacheFilePath(): string;
  read(): Promise<null | undefined | CacheData>;
  write(
    getSnapshot: () => CacheData,
    writeOptions: CacheManagerWriteOptions,
  ): Promise<void>;
  end(): Promise<void>;
}
