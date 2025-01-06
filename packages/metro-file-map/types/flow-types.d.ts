/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {PerfLogger, PerfLoggerFactory, RootPerfLogger} from 'metro-config';

export type {PerfLoggerFactory, PerfLogger};

/**
 * These inputs affect the internal data collected for a given filesystem
 * state, and changes may invalidate a cache.
 */
export type BuildParameters = Readonly<{
  computeDependencies: boolean;
  computeSha1: boolean;
  enableHastePackages: boolean;
  enableSymlinks: boolean;
  extensions: ReadonlyArray<string>;
  forceNodeFilesystemAPI: boolean;
  ignorePattern: RegExp;
  mocksPattern: RegExp | null;
  platforms: ReadonlyArray<string>;
  retainAllFiles: boolean;
  rootDir: string;
  roots: ReadonlyArray<string>;
  skipPackageJson: boolean;
  dependencyExtractor: string | null;
  hasteImplModulePath: string | null;
  cacheBreaker: string;
}>;

export interface BuildResult {
  fileSystem: FileSystem;
  hasteMap: HasteMap;
}

export interface CacheData {
  readonly clocks: WatchmanClocks;
  readonly mocks: RawMockMap;
  readonly files: FileData;
}

export interface CacheManager {
  read(): Promise<CacheData | null>;
  write(
    dataSnapshot: CacheData,
    delta: Readonly<{changed: FileData; removed: FileData}>,
  ): Promise<void>;
}

export type CacheManagerFactory = (
  buildParameters: BuildParameters,
) => CacheManager;

export interface ChangeEvent {
  logger: RootPerfLogger | null;
  eventsQueue: EventsQueue;
}

export interface ChangeEventMetadata {
  /** Epoch ms */
  modifiedTime: number | null;
  /** Bytes */
  size: number | null;
  /** Regular file / Directory / Symlink */
  type: 'f' | 'd' | 'l';
}

export type Console = typeof global.console;

export interface CrawlerOptions {
  abortSignal: AbortSignal | null;
  computeSha1: boolean;
  extensions: ReadonlyArray<string>;
  forceNodeFilesystemAPI: boolean;
  ignore: IgnoreMatcher;
  includeSymlinks: boolean;
  perfLogger?: PerfLogger | null;
  previousState: Readonly<{
    clocks: ReadonlyMap<Path, WatchmanClockSpec>;
    files: ReadonlyMap<Path, FileMetaData>;
  }>;
  rootDir: string;
  roots: ReadonlyArray<string>;
  onStatus: (status: WatcherStatus) => void;
}

export type WatcherStatus =
  | {
      type: 'watchman_slow_command';
      timeElapsed: number;
      command: 'watch-project' | 'query';
    }
  | {
      type: 'watchman_slow_command_complete';
      timeElapsed: number;
      command: 'watch-project' | 'query';
    }
  | {
      type: 'watchman_warning';
      warning: unknown;
      command: 'watch-project' | 'query';
    };

export type DuplicatesSet = Map<string, /* type */ number>;
export type DuplicatesIndex = Map<string, Map<string, DuplicatesSet>>;

export type EventsQueue = Array<{
  filePath: Path;
  metadata?: ChangeEventMetadata | null;
  type: string;
}>;

export interface HType {
  ID: 0;
  MTIME: 1;
  SIZE: 2;
  VISITED: 3;
  DEPENDENCIES: 4;
  SHA1: 5;
  SYMLINK: 6;
  PATH: 0;
  TYPE: 1;
  MODULE: 0;
  PACKAGE: 1;
  GENERIC_PLATFORM: 'g';
  NATIVE_PLATFORM: 'native';
  DEPENDENCY_DELIM: '\0';
}

type Values<T> = T[keyof T];
export type HTypeValue = Values<HType>;

export type IgnoreMatcher = (item: string) => boolean;

export type FileData = Map<Path, FileMetaData>;

export type FileMetaData = [
  /* id */ string,
  /* mtime */ number,
  /* size */ number,
  /* visited */ 0 | 1,
  /* dependencies */ string,
  /* sha1 */ string | null,
  /* symlink */ 0 | 1 | string, // string specifies target, if known
];

export type FileStats = Readonly<{
  fileType: 'f' | 'l';
  modifiedTime: number;
}>;

export interface FileSystem {
  exists(file: Path): boolean;
  getAllFiles(): Path[];
  getDependencies(file: Path): string[] | null;
  getModuleName(file: Path): string | null;
  getSerializableSnapshot(): FileData;
  getSha1(file: Path): string | null;

  /**
   * Given a start path (which need not exist), a subpath and type, and
   * optionally a 'breakOnSegment', performs the following:
   *
   * X = mixedStartPath
   * do
   *   if basename(X) === opts.breakOnSegment
   *     return null
   *   if X + subpath exists and has type opts.subpathType
   *     return {
   *       absolutePath: realpath(X + subpath)
   *       containerRelativePath: relative(mixedStartPath, X)
   *     }
   *   X = dirname(X)
   * while X !== dirname(X)
   *
   * If opts.invalidatedBy is given, collects all absolute, real paths that if
   * added or removed may invalidate this result.
   *
   * Useful for finding the closest package scope (subpath: package.json,
   * type f, breakOnSegment: node_modules) or closest potential package root
   * (subpath: node_modules/pkg, type: d) in Node.js resolution.
   */
  hierarchicalLookup(
    mixedStartPath: string,
    subpath: string,
    opts: {
      breakOnSegment: string | null | undefined;
      invalidatedBy: Set<string> | null | undefined;
      subpathType: 'f' | 'd';
    },
  ): {
    absolutePath: string;
    containerRelativePath: string;
  } | null;

  /**
   * Analogous to posix lstat. If the file at `file` is a symlink, return
   * information about the symlink without following it.
   */
  linkStats(file: Path): FileStats | null;

  /**
   * Return information about the given path, whether a directory or file.
   * Always follow symlinks, and return a real path if it exists.
   */
  lookup(mixedPath: Path): LookupResult;

  matchFiles(opts: {
    /* Filter relative paths against a pattern. */
    filter?: RegExp | null;
    /* `filter` is applied against absolute paths, vs rootDir-relative. (default: false) */
    filterCompareAbsolute?: boolean;
    /* `filter` is applied against posix-delimited paths, even on Windows. (default: false) */
    filterComparePosix?: boolean;
    /* Follow symlinks when enumerating paths. (default: false) */
    follow?: boolean;
    /* Should search for files recursively. (default: true) */
    recursive?: boolean;
    /* Match files under a given root, or null for all files */
    rootDir?: Path | null;
  }): Iterable<Path>;
}

export type Glob = string;

export type LookupResult =
  | {
      // The node is missing from the FileSystem implementation (note this
      // could indicate an unwatched path, or a directory containing no watched
      // files).
      exists: false;
      // The real, normal, absolute paths of any symlinks traversed.
      links: ReadonlySet<string>;
      // The real, normal, absolute path of the first path segment
      // encountered that does not exist, or cannot be navigated through.
      missing: string;
    }
  | {
      exists: true;
      // The real, normal, absolute paths of any symlinks traversed.
      links: ReadonlySet<string>;
      // The real, normal, absolute path of the file or directory.
      realPath: string;
      // Currently lookup always follows symlinks, so can only return
      // directories or regular files, but this may be extended.
      type: 'd' | 'f';
    };

export type HasteConflict = {
  id: string;
  platform: string | null;
  absolutePaths: Array<string>;
  type: 'duplicate' | 'shadowing';
};

export interface HasteMap {
  getModule(
    name: string,
    platform?: string | null,
    supportsNativePlatform?: boolean | null,
    type?: HTypeValue | null,
  ): Path | null;

  getPackage(
    name: string,
    platform: string | null,
    _supportsNativePlatform: boolean | null,
  ): Path | null;

  computeConflicts(): Array<HasteConflict>;
}

export type RawMockMap = {
  readonly mocks: Map<string, string>;
  readonly duplicates: Map<string, Set<string>>;
};

export type HasteMapData = Map<string, HasteMapItem>;

export interface HasteMapItem {
  [platform: string]: HasteMapItemMetaData;
}
export type HasteMapItemMetaData = [/* path */ string, /* type */ number];

export interface MutableFileSystem extends FileSystem {
  remove(filePath: Path): void;
  addOrModify(filePath: Path, fileMetadata: FileMetaData): void;
  bulkAddOrModify(addedOrModifiedFiles: FileData): void;
}

export type Path = string;

export type WatchmanClockSpec =
  | string
  | Readonly<{scm: Readonly<{'mergebase-with': string}>}>;
export type WatchmanClocks = Map<Path, WatchmanClockSpec>;

export type WorkerMessage = Readonly<{
  computeDependencies: boolean;
  computeSha1: boolean;
  dependencyExtractor?: string | null;
  enableHastePackages: boolean;
  rootDir: string;
  filePath: string;
  hasteImplModulePath?: string | null;
}>;

export type WorkerMetadata = Readonly<{
  dependencies?: ReadonlyArray<string>;
  id?: string | null;
  module?: HasteMapItemMetaData | null;
  sha1?: string | null;
}>;
