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
  BuildResult,
  CacheData,
  CacheManagerFactory,
  ChangeEventMetadata,
  Console,
  FileData,
  FileSystem,
  HasteMapData,
  HasteMapItem,
  PerfLoggerFactory,
} from './flow-types';
import type {EventEmitter} from 'events';

export type {
  BuildParameters,
  CacheData,
  ChangeEventMetadata,
  FileData,
  FileMap,
  FileSystem,
  HasteMapData,
  HasteMapItem,
};

export type InputOptions = Readonly<{
  computeDependencies?: boolean | null;
  computeSha1?: boolean | null;
  enableSymlinks?: boolean | null;
  extensions: ReadonlyArray<string>;
  forceNodeFilesystemAPI?: boolean | null;
  ignorePattern?: RegExp | null;
  mocksPattern?: string | null;
  platforms: ReadonlyArray<string>;
  retainAllFiles: boolean;
  rootDir: string;
  roots: ReadonlyArray<string>;
  skipPackageJson?: boolean | null;

  /** Module paths that should export a 'getCacheKey' method */
  dependencyExtractor?: string | null;
  hasteImplModulePath?: string | null;

  perfLoggerFactory?: PerfLoggerFactory | null;
  resetCache?: boolean | null;
  maxWorkers: number;
  throwOnModuleCollision?: boolean | null;
  useWatchman?: boolean | null;
  watchmanDeferStates?: ReadonlyArray<string>;
  watch?: boolean | null;
  console?: Console;
  cacheManagerFactory?: CacheManagerFactory | null;

  healthCheck: HealthCheckOptions;
}>;

type HealthCheckOptions = Readonly<{
  enabled: boolean;
  interval: number;
  timeout: number;
  filePrefix: string;
}>;

export {DiskCacheManager} from './cache/DiskCacheManager';
export {DuplicateHasteCandidatesError} from './lib/DuplicateHasteCandidatesError';
export type {HasteMap} from './flow-types';
export type {HealthCheckResult} from './Watcher';
export type {
  CacheManager,
  CacheManagerFactory,
  ChangeEvent,
  WatcherStatus,
} from './flow-types';

export default class FileMap extends EventEmitter {
  static create(options: InputOptions): FileMap;
  constructor(options: InputOptions);
  build(): Promise<BuildResult>;
  read(): Promise<CacheData | null>;
}

export class DuplicateError extends Error {}
