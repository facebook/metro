/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<9cdec2a3b7a46f0a893dd5dc392a5294>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/cache/DiskCacheManager.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
    $$PARAM_0$$: CacheManagerFactoryOptions,
    $$PARAM_1$$: DiskCacheConfig,
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
    $$PARAM_1$$: CacheManagerWriteOptions,
  ): Promise<void>;
  end(): Promise<void>;
}
