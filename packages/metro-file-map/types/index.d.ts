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
  CacheManager,
  CacheManagerFactory,
  CanonicalPath,
  ChangeEventClock,
  ChangeEventMetadata,
  Console,
  CrawlerOptions,
  FileData,
  FileMapPlugin,
  FileMetadata,
  FileSystem,
  HasteMapData,
  HasteMapItem,
  HType,
  MutableFileSystem,
  Path,
  PerfLogger,
  PerfLoggerFactory,
  WatchmanClocks,
} from './flow-types';

import {FileProcessor} from './lib/FileProcessor';
import {RootPathUtils} from './lib/RootPathUtils';
import {Watcher} from './Watcher';
import EventEmitter from 'events';

export type {
  BuildParameters,
  BuildResult,
  CacheData,
  ChangeEventMetadata,
  FileData,
  FileMap,
  FileSystem,
  HasteMapData,
  HasteMapItem,
};
export type InputOptions = Readonly<{
  computeDependencies?: null | undefined | boolean;
  computeSha1?: null | undefined | boolean;
  enableHastePackages?: boolean;
  enableSymlinks?: null | undefined | boolean;
  enableWorkerThreads?: null | undefined | boolean;
  extensions: ReadonlyArray<string>;
  forceNodeFilesystemAPI?: null | undefined | boolean;
  ignorePattern?: null | undefined | RegExp;
  mocksPattern?: null | undefined | string;
  platforms: ReadonlyArray<string>;
  plugins?: ReadonlyArray<FileMapPlugin>;
  retainAllFiles: boolean;
  rootDir: string;
  roots: ReadonlyArray<string>;
  dependencyExtractor?: null | undefined | string;
  hasteImplModulePath?: null | undefined | string;
  cacheManagerFactory?: null | undefined | CacheManagerFactory;
  console?: Console;
  healthCheck: HealthCheckOptions;
  maxFilesPerWorker?: null | undefined | number;
  maxWorkers: number;
  perfLoggerFactory?: null | undefined | PerfLoggerFactory;
  resetCache?: null | undefined | boolean;
  throwOnModuleCollision?: null | undefined | boolean;
  useWatchman?: null | undefined | boolean;
  watch?: null | undefined | boolean;
  watchmanDeferStates?: ReadonlyArray<string>;
}>;
type HealthCheckOptions = Readonly<{
  enabled: boolean;
  interval: number;
  timeout: number;
  filePrefix: string;
}>;
type InternalOptions = Readonly<
  Omit<
    BuildParameters,
    keyof {
      healthCheck: HealthCheckOptions;
      perfLoggerFactory: null | undefined | PerfLoggerFactory;
      resetCache: null | undefined | boolean;
      useWatchman: boolean;
      watch: boolean;
      watchmanDeferStates: ReadonlyArray<string>;
    }
  > & {
    healthCheck: HealthCheckOptions;
    perfLoggerFactory: null | undefined | PerfLoggerFactory;
    resetCache: null | undefined | boolean;
    useWatchman: boolean;
    watch: boolean;
    watchmanDeferStates: ReadonlyArray<string>;
  }
>;
export {DiskCacheManager} from './cache/DiskCacheManager';
export {DuplicateHasteCandidatesError} from './plugins/haste/DuplicateHasteCandidatesError';
export {HasteConflictsError} from './plugins/haste/HasteConflictsError';
export {default as HastePlugin} from './plugins/HastePlugin';
export type {HasteMap} from './flow-types';
export type {HealthCheckResult} from './Watcher';
export type {
  CacheManager,
  CacheManagerFactory,
  CacheManagerFactoryOptions,
  CacheManagerWriteOptions,
  ChangeEvent,
  DependencyExtractor,
  WatcherStatus,
} from './flow-types';
/**
 * FileMap includes a JavaScript implementation of Facebook's haste module system.
 *
 * This implementation is inspired by https://github.com/facebook/node-haste
 * and was built with for high-performance in large code repositories with
 * hundreds of thousands of files. This implementation is scalable and provides
 * predictable performance.
 *
 * Because the haste map creation and synchronization is critical to startup
 * performance and most tasks are blocked by I/O this class makes heavy use of
 * synchronous operations. It uses worker processes for parallelizing file
 * access and metadata extraction.
 *
 * The data structures created by `metro-file-map` can be used directly from the
 * cache without further processing. The metadata objects in the `files` and
 * `map` objects contain cross-references: a metadata object from one can look
 * up the corresponding metadata object in the other map. Note that in most
 * projects, the number of files will be greater than the number of haste
 * modules one module can refer to many files based on platform extensions.
 *
 * type CacheData = {
 *   clocks: WatchmanClocks,
 *   files: {[filepath: string]: FileMetadata},
 *   map: {[id: string]: HasteMapItem},
 *   mocks: {[id: string]: string},
 * }
 *
 * // Watchman clocks are used for query synchronization and file system deltas.
 * type WatchmanClocks = {[filepath: string]: string};
 *
 * type FileMetadata = {
 *   id: ?string, // used to look up module metadata objects in `map`.
 *   mtime: number, // check for outdated files.
 *   size: number, // size of the file in bytes.
 *   visited: boolean, // whether the file has been parsed or not.
 *   dependencies: Array<string>, // all relative dependencies of this file.
 *   sha1: ?string, // SHA-1 of the file, if requested via options.
 *   symlink: ?(1 | 0 | string), // Truthy if symlink, string is target
 * };
 *
 * // Modules can be targeted to a specific platform based on the file name.
 * // Example: platform.ios.js and Platform.android.js will both map to the same
 * // `Platform` module. The platform should be specified during resolution.
 * type HasteMapItem = {[platform: string]: ModuleMetadata};
 *
 * //
 * type ModuleMetadata = {
 *   path: string, // the path to look up the file object in `files`.
 *   type: string, // the module type (either `package` or `module`).
 * };
 *
 * Note that the data structures described above are conceptual only. The actual
 * implementation uses arrays and constant keys for metadata storage. Instead of
 * `{id: 'flatMap', mtime: 3421, size: 42, visited: true, dependencies: []}` the real
 * representation is similar to `['flatMap', 3421, 42, 1, []]` to save storage space
 * and reduce parse and write time of a big JSON blob.
 *
 * The HasteMap is created as follows:
 *  1. read data from the cache or create an empty structure.
 *
 *  2. crawl the file system.
 *     * empty cache: crawl the entire file system.
 *     * cache available:
 *       * if watchman is available: get file system delta changes.
 *       * if watchman is unavailable: crawl the entire file system.
 *     * build metadata objects for every file. This builds the `files` part of
 *       the `HasteMap`.
 *
 *  3. parse and extract metadata from changed files.
 *     * this is done in parallel over worker processes to improve performance.
 *     * the worst case is to parse all files.
 *     * the best case is no file system access and retrieving all data from
 *       the cache.
 *     * the average case is a small number of changed files.
 *
 *  4. serialize the new `HasteMap` in a cache file.
 *
 */
declare class FileMap extends EventEmitter {
  _buildPromise: null | undefined | Promise<BuildResult>;
  canUseWatchmanPromise: Promise<boolean>;
  _changeID: number;
  _fileProcessor: FileProcessor;
  _console: Console;
  _options: InternalOptions;
  _pathUtils: RootPathUtils;
  _watcher: null | undefined | Watcher;
  _cacheManager: CacheManager;
  _crawlerAbortController: AbortController;
  _startupPerfLogger: null | undefined | PerfLogger;
  static create(options: InputOptions): FileMap;
  constructor(options: InputOptions);
  build(): Promise<BuildResult>;
  /**
   * 1. read data from the cache or create an empty structure.
   */
  read(): Promise<null | undefined | CacheData>;
  /**
   * 2. crawl the file system.
   */
  _buildFileDelta(previousState: CrawlerOptions['previousState']): Promise<{
    removedFiles: Set<CanonicalPath>;
    changedFiles: FileData;
    clocks?: WatchmanClocks;
  }>;
  _maybeReadLink(
    filePath: Path,
    fileMetadata: FileMetadata,
  ): null | undefined | Promise<void>;
  _applyFileDelta(
    fileSystem: MutableFileSystem,
    plugins: ReadonlyArray<FileMapPlugin>,
    delta: Readonly<{
      changedFiles: FileData;
      removedFiles: ReadonlySet<CanonicalPath>;
      clocks?: WatchmanClocks;
    }>,
  ): Promise<void>;
  /**
   * 4. Serialize a snapshot of our raw data via the configured cache manager
   */
  _takeSnapshotAndPersist(
    fileSystem: FileSystem,
    clocks: WatchmanClocks,
    plugins: ReadonlyArray<FileMapPlugin>,
    changed: FileData,
    removed: Set<CanonicalPath>,
  ): void;
  /**
   * Watch mode
   */
  _watch(
    fileSystem: MutableFileSystem,
    clocks: WatchmanClocks,
    plugins: ReadonlyArray<FileMapPlugin>,
  ): Promise<void>;
  end(): Promise<void>;
  _shouldUseWatchman(): Promise<boolean>;
  _getNextChangeID(): number;
  _updateClock(
    clocks: WatchmanClocks,
    newClock?: null | undefined | ChangeEventClock,
  ): void;
  static H: HType;
}
export default FileMap;
