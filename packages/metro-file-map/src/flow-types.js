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

'use strict';

import type ModuleMap from './ModuleMap';
import type {PerfLoggerFactory, RootPerfLogger, PerfLogger} from 'metro-config';
import type {AbortSignal} from 'node-abort-controller';

export type {PerfLoggerFactory, PerfLogger};

// These inputs affect the internal data collected for a given filesystem
// state, and changes may invalidate a cache.
export type BuildParameters = $ReadOnly<{
  computeDependencies: boolean,
  computeSha1: boolean,
  enableSymlinks: boolean,
  extensions: $ReadOnlyArray<string>,
  forceNodeFilesystemAPI: boolean,
  ignorePattern: RegExp,
  mocksPattern: ?RegExp,
  platforms: $ReadOnlyArray<string>,
  retainAllFiles: boolean,
  rootDir: string,
  roots: $ReadOnlyArray<string>,
  skipPackageJson: boolean,

  // Module paths that should export a 'getCacheKey' method
  dependencyExtractor: ?string,
  hasteImplModulePath: ?string,

  cacheBreaker: string,
}>;

export type BuildResult = {
  fileSystem: FileSystem,
  hasteModuleMap: ModuleMap,
};

export type CacheData = $ReadOnly<{
  clocks: WatchmanClocks,
  map: RawModuleMap['map'],
  mocks: RawModuleMap['mocks'],
  duplicates: RawModuleMap['duplicates'],
  files: FileData,
}>;

export interface CacheManager {
  read(): Promise<?CacheData>;
  write(
    dataSnapshot: CacheData,
    delta: $ReadOnly<{changed: FileData, removed: FileData}>,
  ): Promise<void>;
}

export type CacheManagerFactory = (
  buildParameters: BuildParameters,
) => CacheManager;

export type ChangeEvent = {
  logger: ?RootPerfLogger,
  eventsQueue: EventsQueue,
};

export type ChangeEventMetadata = {
  modifiedTime: ?number, // Epoch ms
  size: ?number, // Bytes
  type: 'f' | 'd' | 'l', // Regular file / Directory / Symlink
};

export type Console = typeof global.console;

export type CrawlerOptions = {
  abortSignal: ?AbortSignal,
  computeSha1: boolean,
  extensions: $ReadOnlyArray<string>,
  forceNodeFilesystemAPI: boolean,
  ignore: IgnoreMatcher,
  includeSymlinks: boolean,
  perfLogger?: ?PerfLogger,
  previousState: $ReadOnly<{
    clocks: $ReadOnlyMap<Path, WatchmanClockSpec>,
    files: $ReadOnlyMap<Path, FileMetaData>,
  }>,
  rootDir: string,
  roots: $ReadOnlyArray<string>,
  onStatus: (status: WatcherStatus) => void,
};

export type WatcherStatus =
  | {
      type: 'watchman_slow_command',
      timeElapsed: number,
      command: 'watch-project' | 'query',
    }
  | {
      type: 'watchman_slow_command_complete',
      timeElapsed: number,
      command: 'watch-project' | 'query',
    }
  | {
      type: 'watchman_warning',
      warning: mixed,
      command: 'watch-project' | 'query',
    };

export type DuplicatesSet = Map<string, /* type */ number>;
export type DuplicatesIndex = Map<string, Map<string, DuplicatesSet>>;

export type EventsQueue = Array<{
  filePath: Path,
  metadata?: ?ChangeEventMetadata,
  type: string,
}>;

export type HType = {
  ID: 0,
  MTIME: 1,
  SIZE: 2,
  VISITED: 3,
  DEPENDENCIES: 4,
  SHA1: 5,
  SYMLINK: 6,
  PATH: 0,
  TYPE: 1,
  MODULE: 0,
  PACKAGE: 1,
  GENERIC_PLATFORM: 'g',
  NATIVE_PLATFORM: 'native',
  DEPENDENCY_DELIM: '\0',
};

export type HTypeValue = $Values<HType>;

export type IgnoreMatcher = (item: string) => boolean;

export type FileData = Map<Path, FileMetaData>;

export type FileMetaData = [
  /* id */ string,
  /* mtime */ ?number,
  /* size */ number,
  /* visited */ 0 | 1,
  /* dependencies */ string,
  /* sha1 */ ?string,
  /* symlink */ 0 | 1 | string, // string specifies target, if known
];

export type FileStats = $ReadOnly<{
  fileType: 'f' | 'l',
  modifiedTime: ?number,
}>;

export interface FileSystem {
  exists(file: Path): boolean;
  getAllFiles(): Array<Path>;
  getDependencies(file: Path): ?Array<string>;
  getModuleName(file: Path): ?string;
  getRealPath(file: Path): ?string;
  getSerializableSnapshot(): FileData;
  getSha1(file: Path): ?string;

  /**
   * Analogous to posix lstat. If the file at `file` is a symlink, return
   * information about the symlink without following it.
   */
  linkStats(file: Path): ?FileStats;

  matchFiles(pattern: RegExp | string): Array<Path>;

  /**
   * Given a search context, return a list of file paths matching the query.
   * The query matches against normalized paths which start with `./`,
   * for example: `a/b.js` -> `./a/b.js`
   */
  matchFilesWithContext(
    root: Path,
    context: $ReadOnly<{
      /* Should search for files recursively. */
      recursive: boolean,
      /* Filter relative paths against a pattern. */
      filter: RegExp,
    }>,
  ): Array<Path>;
}

export type Glob = string;

export interface IModuleMap {
  getModule(
    name: string,
    platform?: ?string,
    supportsNativePlatform?: ?boolean,
    type?: ?HTypeValue,
  ): ?Path;

  getPackage(
    name: string,
    platform: ?string,
    _supportsNativePlatform: ?boolean,
  ): ?Path;

  getMockModule(name: string): ?Path;

  getRawModuleMap(): ReadOnlyRawModuleMap;
}

export type MockData = Map<string, Path>;
export type ModuleMapData = Map<string, ModuleMapItem>;

export type ModuleMapItem = {
  [platform: string]: ModuleMetaData,
  __proto__: null,
};
export type ModuleMetaData = [/* path */ string, /* type */ number];

export interface MutableFileSystem extends FileSystem {
  remove(filePath: Path): ?FileMetaData;
  addOrModify(filePath: Path, fileMetadata: FileMetaData): void;
  bulkAddOrModify(addedOrModifiedFiles: FileData): void;
}

export type Path = string;

export type RawModuleMap = {
  rootDir: Path,
  duplicates: DuplicatesIndex,
  map: ModuleMapData,
  mocks: MockData,
};

export type ReadOnlyRawModuleMap = $ReadOnly<{
  rootDir: Path,
  duplicates: $ReadOnlyMap<
    string,
    $ReadOnlyMap<string, $ReadOnlyMap<string, number>>,
  >,
  map: $ReadOnlyMap<string, ModuleMapItem>,
  mocks: $ReadOnlyMap<string, Path>,
}>;

export type WatchmanClockSpec =
  | string
  | $ReadOnly<{scm: $ReadOnly<{'mergebase-with': string}>}>;
export type WatchmanClocks = Map<Path, WatchmanClockSpec>;

export type WorkerMessage = $ReadOnly<{
  computeDependencies: boolean,
  computeSha1: boolean,
  dependencyExtractor?: ?string,
  enableHastePackages: boolean,
  readLink: boolean,
  rootDir: string,
  filePath: string,
  hasteImplModulePath?: ?string,
}>;

export type WorkerMetadata = $ReadOnly<{
  dependencies?: ?$ReadOnlyArray<string>,
  id?: ?string,
  module?: ?ModuleMetaData,
  sha1?: ?string,
  symlinkTarget?: ?string,
}>;
