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

import type {PerfLogger, PerfLoggerFactory, RootPerfLogger} from 'metro-config';

export type {PerfLoggerFactory, PerfLogger};

// These inputs affect the internal data collected for a given filesystem
// state, and changes may invalidate a cache.
export type BuildParameters = $ReadOnly<{
  computeDependencies: boolean,
  computeSha1: boolean,
  enableHastePackages: boolean,
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
  hasteMap: HasteMap,
  mockMap: ?MockMap,
};

export type CacheData = $ReadOnly<{
  clocks: WatchmanClocks,
  fileSystemData: mixed,
  plugins: $ReadOnlyMap<string, mixed>,
}>;

export interface CacheManager {
  /**
   * Called during startup to load initial state, if available. Provided to
   * a crawler, which will return the delta between the initial state and the
   * current file system state.
   */
  read(): Promise<?CacheData>;

  /**
   * Called when metro-file-map `build()` has applied changes returned by the
   * crawler - i.e. internal state reflects the current file system state.
   *
   * getSnapshot may be retained and called at any time before end(), such as
   * in response to eventSource 'change' events.
   */
  write(
    getSnapshot: () => CacheData,
    opts: CacheManagerWriteOptions,
  ): Promise<void>;

  /**
   * The last call that will be made to this CacheManager. Any handles should
   * be closed by the time this settles.
   */
  end(): Promise<void>;
}

export interface CacheManagerEventSource {
  onChange(listener: () => void): () => void /* unsubscribe */;
}

export type CacheManagerFactory = (
  options: CacheManagerFactoryOptions,
) => CacheManager;

export type CacheManagerFactoryOptions = $ReadOnly<{
  buildParameters: BuildParameters,
}>;

export type CacheManagerWriteOptions = $ReadOnly<{
  changedSinceCacheRead: boolean,
  eventSource: CacheManagerEventSource,
  onWriteError: Error => void,
}>;

// A path that is
//  - Relative to the contextual `rootDir`
//  - Normalised (no extraneous '.' or '..')
//  - Real (no symlinks in path, though the path itself may be a symlink)
export type CanonicalPath = string;

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
  console: Console,
  extensions: $ReadOnlyArray<string>,
  forceNodeFilesystemAPI: boolean,
  ignore: IgnoreMatcher,
  includeSymlinks: boolean,
  perfLogger?: ?PerfLogger,
  previousState: $ReadOnly<{
    clocks: $ReadOnlyMap<CanonicalPath, WatchmanClockSpec>,
    fileSystem: FileSystem,
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
  metadata: ChangeEventMetadata,
  type: string,
}>;

export type FileMapDelta = $ReadOnly<{
  removed: Iterable<[CanonicalPath, FileMetaData]>,
  addedOrModified: Iterable<[CanonicalPath, FileMetaData]>,
}>;

interface FileSystemState {
  metadataIterator(
    opts: $ReadOnly<{
      includeNodeModules: boolean,
      includeSymlinks: boolean,
    }>,
  ): Iterable<{
    baseName: string,
    canonicalPath: string,
    metadata: FileMetaData,
  }>;
}

export type FileMapPluginInitOptions<SerializableState> = $ReadOnly<{
  files: FileSystemState,
  pluginState: ?SerializableState,
}>;

type V8Serializable = interface {};

export interface FileMapPlugin<SerializableState = V8Serializable> {
  +name: string;
  initialize(
    initOptions: FileMapPluginInitOptions<SerializableState>,
  ): Promise<void>;
  assertValid(): void;
  bulkUpdate(delta: FileMapDelta): Promise<void>;
  getSerializableSnapshot(): SerializableState;
  onRemovedFile(relativeFilePath: string, fileMetadata: FileMetaData): void;
  onNewOrModifiedFile(
    relativeFilePath: string,
    fileMetadata: FileMetaData,
  ): void;
}

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

export type FileData = Map<CanonicalPath, FileMetaData>;

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
  size: ?number,
}>;

export interface FileSystem {
  exists(file: Path): boolean;
  getAllFiles(): Array<Path>;
  getDependencies(file: Path): ?Array<string>;
  getDifference(files: FileData): {
    changedFiles: FileData,
    removedFiles: Set<string>,
  };
  getModuleName(file: Path): ?string;
  getSerializableSnapshot(): CacheData['fileSystemData'];
  getSha1(file: Path): ?string;
  getOrComputeSha1(file: Path): Promise<?{sha1: string, content?: Buffer}>;

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
      breakOnSegment: ?string,
      invalidatedBy: ?Set<string>,
      subpathType: 'f' | 'd',
    },
  ): ?{
    absolutePath: string,
    containerRelativePath: string,
  };

  /**
   * Analogous to posix lstat. If the file at `file` is a symlink, return
   * information about the symlink without following it.
   */
  linkStats(file: Path): ?FileStats;

  /**
   * Return information about the given path, whether a directory or file.
   * Always follow symlinks, and return a real path if it exists.
   */
  lookup(mixedPath: Path): LookupResult;

  matchFiles(opts: {
    /* Filter relative paths against a pattern. */
    filter?: RegExp | null,
    /* `filter` is applied against absolute paths, vs rootDir-relative. (default: false) */
    filterCompareAbsolute?: boolean,
    /* `filter` is applied against posix-delimited paths, even on Windows. (default: false) */
    filterComparePosix?: boolean,
    /* Follow symlinks when enumerating paths. (default: false) */
    follow?: boolean,
    /* Should search for files recursively. (default: true) */
    recursive?: boolean,
    /* Match files under a given root, or null for all files */
    rootDir?: Path | null,
  }): Iterable<Path>;
}

export type Glob = string;

export type LookupResult =
  | {
      // The node is missing from the FileSystem implementation (note this
      // could indicate an unwatched path, or a directory containing no watched
      // files).
      exists: false,
      // The real, normal, absolute paths of any symlinks traversed.
      links: $ReadOnlySet<string>,
      // The real, normal, absolute path of the first path segment
      // encountered that does not exist, or cannot be navigated through.
      missing: string,
    }
  | {
      exists: true,
      // The real, normal, absolute paths of any symlinks traversed.
      links: $ReadOnlySet<string>,
      // The real, normal, absolute path of the file or directory.
      realPath: string,
      // Currently lookup always follows symlinks, so can only return
      // directories or regular files, but this may be extended.
      type: 'd' | 'f',
    };

export interface MockMap {
  getMockModule(name: string): ?Path;
}

export type HasteConflict = {
  id: string,
  platform: string | null,
  absolutePaths: Array<string>,
  type: 'duplicate' | 'shadowing',
};

export interface HasteMap {
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

  computeConflicts(): Array<HasteConflict>;
}

export type HasteMapData = Map<string, HasteMapItem>;

export type HasteMapItem = {
  [platform: string]: HasteMapItemMetaData,
  __proto__: null,
};
export type HasteMapItemMetaData = [/* path */ string, /* type */ number];

export interface MutableFileSystem extends FileSystem {
  remove(filePath: Path): ?FileMetaData;
  addOrModify(filePath: Path, fileMetadata: FileMetaData): void;
  bulkAddOrModify(addedOrModifiedFiles: FileData): void;
}

export type Path = string;

export type ProcessFileFunction = (
  absolutePath: string,
  metadata: FileMetaData,
  request: $ReadOnly<{computeSha1: boolean}>,
) => Promise<?Buffer>;

export type RawMockMap = $ReadOnly<{
  duplicates: Map<
    string, // posix-separated mock name
    Set<string>, // posix-separated, project-relative paths
  >,
  mocks: Map<
    string, // posix-separated mock name
    Path, // posix-separated, project-relative path
  >,
  version: number,
}>;

export type ReadOnlyRawMockMap = $ReadOnly<{
  duplicates: $ReadOnlyMap<string, $ReadOnlySet<string>>,
  mocks: $ReadOnlyMap<string, Path>,
  version: number,
}>;

export interface WatcherBackend {
  getPauseReason(): ?string;
  onError((error: Error) => void): () => void;
  onFileEvent((event: WatcherBackendChangeEvent) => void): () => void;
  startWatching(): Promise<void>;
  stopWatching(): Promise<void>;
}

export type ChangeEventClock = [
  string /* absolute watch root */,
  string /* opaque clock */,
];

export type WatcherBackendChangeEvent =
  | $ReadOnly<{
      event: 'touch',
      clock?: ChangeEventClock,
      relativePath: string,
      root: string,
      metadata: ChangeEventMetadata,
    }>
  | $ReadOnly<{
      event: 'delete',
      clock?: ChangeEventClock,
      relativePath: string,
      root: string,
      metadata?: void,
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
  filePath: string,
  hasteImplModulePath?: ?string,
  maybeReturnContent: boolean,
}>;

export type WorkerMetadata = $ReadOnly<{
  dependencies?: ?$ReadOnlyArray<string>,
  id?: ?string,
  sha1?: ?string,
  content?: ?Buffer,
}>;
