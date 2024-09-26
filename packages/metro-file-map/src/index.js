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
  BuildResult,
  CacheData,
  CacheManager,
  CacheManagerFactory,
  CanonicalPath,
  ChangeEvent,
  ChangeEventMetadata,
  Console,
  CrawlerOptions,
  EventsQueue,
  FileData,
  FileMetaData,
  FileSystem,
  HasteMapData,
  HasteMapItem,
  HType,
  MutableFileSystem,
  Path,
  PerfLogger,
  PerfLoggerFactory,
  RawMockMap,
  ReadOnlyRawMockMap,
  WatchmanClocks,
  WorkerMetadata,
} from './flow-types';
import type {IJestWorker} from 'jest-worker';

import {DiskCacheManager} from './cache/DiskCacheManager';
import H from './constants';
import getMockName from './getMockName';
import checkWatchmanCapabilities from './lib/checkWatchmanCapabilities';
import {DuplicateError} from './lib/DuplicateError';
import MockMapImpl from './lib/MockMap';
import MutableHasteMap from './lib/MutableHasteMap';
import normalizePathSeparatorsToSystem from './lib/normalizePathSeparatorsToSystem';
import {RootPathUtils} from './lib/RootPathUtils';
import TreeFS from './lib/TreeFS';
import {Watcher} from './Watcher';
import {worker} from './worker';
import EventEmitter from 'events';
import invariant from 'invariant';
import {Worker} from 'jest-worker';
import {AbortController} from 'node-abort-controller';
import nullthrows from 'nullthrows';
import * as path from 'path';
import {performance} from 'perf_hooks';

const debug = require('debug')('Metro:FileMap');

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

export type InputOptions = $ReadOnly<{
  computeDependencies?: ?boolean,
  computeSha1?: ?boolean,
  enableHastePackages?: boolean,
  enableSymlinks?: ?boolean,
  enableWorkerThreads?: ?boolean,
  extensions: $ReadOnlyArray<string>,
  forceNodeFilesystemAPI?: ?boolean,
  ignorePattern?: ?RegExp,
  mocksPattern?: ?string,
  platforms: $ReadOnlyArray<string>,
  retainAllFiles: boolean,
  rootDir: string,
  roots: $ReadOnlyArray<string>,
  skipPackageJson?: ?boolean,

  // Module paths that should export a 'getCacheKey' method
  dependencyExtractor?: ?string,
  hasteImplModulePath?: ?string,

  cacheManagerFactory?: ?CacheManagerFactory,
  console?: Console,
  healthCheck: HealthCheckOptions,
  maxWorkers: number,
  perfLoggerFactory?: ?PerfLoggerFactory,
  resetCache?: ?boolean,
  throwOnModuleCollision?: ?boolean,
  useWatchman?: ?boolean,
  watch?: ?boolean,
  watchmanDeferStates?: $ReadOnlyArray<string>,
}>;

type HealthCheckOptions = $ReadOnly<{
  enabled: boolean,
  interval: number,
  timeout: number,
  filePrefix: string,
}>;

type InternalOptions = {
  ...BuildParameters,
  enableWorkerThreads: boolean,
  healthCheck: HealthCheckOptions,
  perfLoggerFactory: ?PerfLoggerFactory,
  resetCache: ?boolean,
  maxWorkers: number,
  throwOnModuleCollision: boolean,
  useWatchman: boolean,
  watch: boolean,
  watchmanDeferStates: $ReadOnlyArray<string>,
};

type WorkerObj = {worker: typeof worker};
type WorkerInterface = IJestWorker<WorkerObj> | WorkerObj;

export {DiskCacheManager} from './cache/DiskCacheManager';
export {DuplicateHasteCandidatesError} from './lib/DuplicateHasteCandidatesError';
export {default as MutableHasteMap} from './lib/MutableHasteMap';

export type {HasteMap} from './flow-types';
export type {HealthCheckResult} from './Watcher';
export type {
  CacheDelta,
  CacheManager,
  CacheManagerFactory,
  ChangeEvent,
  WatcherStatus,
} from './flow-types';

// This should be bumped whenever a code change to `metro-file-map` itself
// would cause a change to the cache data structure and/or content (for a given
// filesystem state and build parameters).
const CACHE_BREAKER = '7';

const CHANGE_INTERVAL = 30;
// Periodically yield to the event loop to allow parallel I/O, etc.
// Based on 200k files taking up to 800ms => max 40ms between yields.
const YIELD_EVERY_NUM_HASTE_FILES = 10000;

const NODE_MODULES = path.sep + 'node_modules' + path.sep;
const PACKAGE_JSON = path.sep + 'package.json';
const VCS_DIRECTORIES = /[/\\]\.(git|hg)[/\\]/.source;
const WATCHMAN_REQUIRED_CAPABILITIES = [
  'field-content.sha1hex',
  'relative_root',
  'suffix-set',
  'wildmatch',
];

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
 *   files: {[filepath: string]: FileMetaData},
 *   map: {[id: string]: HasteMapItem},
 *   mocks: {[id: string]: string},
 * }
 *
 * // Watchman clocks are used for query synchronization and file system deltas.
 * type WatchmanClocks = {[filepath: string]: string};
 *
 * type FileMetaData = {
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
 * type HasteMapItem = {[platform: string]: ModuleMetaData};
 *
 * //
 * type ModuleMetaData = {
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
export default class FileMap extends EventEmitter {
  _buildPromise: ?Promise<BuildResult>;
  _canUseWatchmanPromise: Promise<boolean>;
  _changeID: number;
  _changeInterval: ?IntervalID;
  _console: Console;
  _options: InternalOptions;
  _pathUtils: RootPathUtils;
  _watcher: ?Watcher;
  _worker: ?WorkerInterface;
  _cacheManager: CacheManager;
  _crawlerAbortController: AbortController;
  _healthCheckInterval: ?IntervalID;
  _startupPerfLogger: ?PerfLogger;

  static create(options: InputOptions): FileMap {
    return new FileMap(options);
  }

  constructor(options: InputOptions) {
    super();

    if (options.perfLoggerFactory) {
      this._startupPerfLogger =
        options.perfLoggerFactory?.('START_UP').subSpan('fileMap') ?? null;
      this._startupPerfLogger?.point('constructor_start');
    }

    // Add VCS_DIRECTORIES to provided ignorePattern
    let ignorePattern;
    if (options.ignorePattern) {
      const inputIgnorePattern = options.ignorePattern;
      if (inputIgnorePattern instanceof RegExp) {
        ignorePattern = new RegExp(
          inputIgnorePattern.source.concat('|' + VCS_DIRECTORIES),
          inputIgnorePattern.flags,
        );
      } else {
        throw new Error(
          'metro-file-map: the `ignorePattern` option must be a RegExp',
        );
      }
    } else {
      ignorePattern = new RegExp(VCS_DIRECTORIES);
    }

    const buildParameters: BuildParameters = {
      computeDependencies:
        options.computeDependencies == null
          ? true
          : options.computeDependencies,
      computeSha1: options.computeSha1 || false,
      dependencyExtractor: options.dependencyExtractor ?? null,
      enableHastePackages: options.enableHastePackages ?? true,
      enableSymlinks: options.enableSymlinks || false,
      extensions: options.extensions,
      forceNodeFilesystemAPI: !!options.forceNodeFilesystemAPI,
      hasteImplModulePath: options.hasteImplModulePath,
      ignorePattern,
      mocksPattern:
        options.mocksPattern != null && options.mocksPattern !== ''
          ? new RegExp(options.mocksPattern)
          : null,
      platforms: options.platforms,
      retainAllFiles: options.retainAllFiles,
      rootDir: options.rootDir,
      roots: Array.from(new Set(options.roots)),
      skipPackageJson: !!options.skipPackageJson,
      cacheBreaker: CACHE_BREAKER,
    };

    this._options = {
      ...buildParameters,
      enableWorkerThreads: options.enableWorkerThreads ?? false,
      healthCheck: options.healthCheck,
      maxWorkers: options.maxWorkers,
      perfLoggerFactory: options.perfLoggerFactory,
      resetCache: options.resetCache,
      throwOnModuleCollision: !!options.throwOnModuleCollision,
      useWatchman: options.useWatchman == null ? true : options.useWatchman,
      watch: !!options.watch,
      watchmanDeferStates: options.watchmanDeferStates ?? [],
    };

    this._console = options.console || global.console;
    this._cacheManager = options.cacheManagerFactory
      ? options.cacheManagerFactory.call(null, buildParameters)
      : new DiskCacheManager({
          buildParameters,
        });

    this._buildPromise = null;
    this._pathUtils = new RootPathUtils(options.rootDir);
    this._worker = null;
    this._startupPerfLogger?.point('constructor_end');
    this._crawlerAbortController = new AbortController();
    this._changeID = 0;
  }

  build(): Promise<BuildResult> {
    this._startupPerfLogger?.point('build_start');
    if (!this._buildPromise) {
      this._buildPromise = (async () => {
        let initialData: ?CacheData;
        if (this._options.resetCache !== true) {
          initialData = await this.read();
        }
        if (!initialData) {
          debug('Not using a cache');
        } else {
          debug('Cache loaded (%d clock(s))', initialData.clocks.size);
        }

        const rootDir = this._options.rootDir;
        this._startupPerfLogger?.point('constructFileSystem_start');
        const fileSystem =
          initialData != null
            ? TreeFS.fromDeserializedSnapshot({
                rootDir,
                // Typed `mixed` because we've read this from an external
                // source. It'd be too expensive to validate at runtime, so
                // trust our cache manager that this is correct.
                // $FlowIgnore
                fileSystemData: initialData.fileSystemData,
              })
            : new TreeFS({rootDir});
        this._startupPerfLogger?.point('constructFileSystem_end');
        const mocks = initialData?.mocks ?? new Map();

        // Construct the Haste map from the cached file system state while
        // crawling to build a diff of current state vs cached. `fileSystem`
        // is not mutated during either operation.
        const [fileDelta, hasteMap] = await Promise.all([
          this._buildFileDelta({
            fileSystem,
            clocks: initialData?.clocks ?? new Map(),
          }),
          this._constructHasteMap(fileSystem),
        ]);

        // Update `fileSystem`, `hasteMap` and `mocks` based on the file delta.
        await this._applyFileDelta(fileSystem, hasteMap, mocks, fileDelta);

        await this._takeSnapshotAndPersist(
          fileSystem,
          fileDelta.clocks ?? new Map(),
          hasteMap,
          mocks,
          fileDelta.changedFiles,
          fileDelta.removedFiles,
        );
        debug(
          'Finished mapping files (%d changes, %d removed).',
          fileDelta.changedFiles.size,
          fileDelta.removedFiles.size,
        );

        await this._watch(fileSystem, hasteMap, mocks);
        return {
          fileSystem,
          hasteMap,
          mockMap: new MockMapImpl({rootDir, rawMockMap: mocks}),
        };
      })();
    }
    return this._buildPromise.then(result => {
      this._startupPerfLogger?.point('build_end');
      return result;
    });
  }

  async _constructHasteMap(fileSystem: TreeFS): Promise<MutableHasteMap> {
    this._startupPerfLogger?.point('constructHasteMap_start');
    const hasteMap = new MutableHasteMap({
      console: this._console,
      platforms: new Set(this._options.platforms),
      rootDir: this._options.rootDir,
      throwOnModuleCollision: this._options.throwOnModuleCollision,
    });
    let hasteFiles = 0;
    for (const {
      baseName,
      canonicalPath,
      metadata,
    } of fileSystem.metadataIterator({
      // Symlinks and node_modules are never Haste modules or packages.
      includeNodeModules: false,
      includeSymlinks: false,
    })) {
      if (metadata[H.ID]) {
        hasteMap.setModule(metadata[H.ID], [
          canonicalPath,
          baseName === 'package.json' ? H.PACKAGE : H.MODULE,
        ]);
        if (++hasteFiles % YIELD_EVERY_NUM_HASTE_FILES === 0) {
          await new Promise(setImmediate);
        }
      }
    }
    this._startupPerfLogger?.annotate({int: {hasteFiles}});
    this._startupPerfLogger?.point('constructHasteMap_end');
    return hasteMap;
  }

  /**
   * 1. read data from the cache or create an empty structure.
   */
  async read(): Promise<?CacheData> {
    let data: ?CacheData;
    this._startupPerfLogger?.point('read_start');
    try {
      data = await this._cacheManager.read();
    } catch (e) {
      this._console.warn(
        'Error while reading cache, falling back to a full crawl:\n',
        e,
      );
      this._startupPerfLogger?.annotate({
        string: {cacheReadError: e.toString()},
      });
    }
    this._startupPerfLogger?.point('read_end');
    return data;
  }

  /**
   * 2. crawl the file system.
   */
  async _buildFileDelta(
    previousState: CrawlerOptions['previousState'],
  ): Promise<{
    removedFiles: Set<CanonicalPath>,
    changedFiles: FileData,
    clocks?: WatchmanClocks,
  }> {
    this._startupPerfLogger?.point('buildFileDelta_start');

    const {
      computeSha1,
      enableSymlinks,
      extensions,
      forceNodeFilesystemAPI,
      ignorePattern,
      roots,
      rootDir,
      watch,
      watchmanDeferStates,
    } = this._options;

    this._watcher = new Watcher({
      abortSignal: this._crawlerAbortController.signal,
      computeSha1,
      console: this._console,
      enableSymlinks,
      extensions,
      forceNodeFilesystemAPI,
      healthCheckFilePrefix: this._options.healthCheck.filePrefix,
      ignore: path => this._ignore(path),
      ignorePattern,
      perfLogger: this._startupPerfLogger,
      previousState,
      roots,
      rootDir,
      useWatchman: await this._shouldUseWatchman(),
      watch,
      watchmanDeferStates,
    });
    const watcher = this._watcher;

    watcher.on('status', status => this.emit('status', status));

    return watcher.crawl().then(result => {
      this._startupPerfLogger?.point('buildFileDelta_end');
      return result;
    });
  }

  /**
   * 3. parse and extract metadata from changed files.
   */
  _processFile(
    hasteMap: MutableHasteMap,
    mockMap: RawMockMap,
    filePath: Path,
    fileMetadata: FileMetaData,
    workerOptions?: {forceInBand?: ?boolean, perfLogger?: ?PerfLogger},
  ): ?Promise<void> {
    const rootDir = this._options.rootDir;

    const relativeFilePath = this._pathUtils.absoluteToNormal(filePath);
    const isSymlink = fileMetadata[H.SYMLINK] !== 0;

    const computeSha1 =
      this._options.computeSha1 && !isSymlink && fileMetadata[H.SHA1] == null;

    const readLink =
      this._options.enableSymlinks &&
      isSymlink &&
      typeof fileMetadata[H.SYMLINK] !== 'string';

    // Callback called when the response from the worker is successful.
    const workerReply = (metadata: WorkerMetadata) => {
      fileMetadata[H.VISITED] = 1;

      const metadataId = metadata.id;
      const metadataModule = metadata.module;

      if (metadataId != null && metadataModule) {
        fileMetadata[H.ID] = metadataId;
        hasteMap.setModule(metadataId, metadataModule);
      }

      fileMetadata[H.DEPENDENCIES] = metadata.dependencies
        ? metadata.dependencies.join(H.DEPENDENCY_DELIM)
        : '';

      if (computeSha1) {
        fileMetadata[H.SHA1] = metadata.sha1;
      }

      if (metadata.symlinkTarget != null) {
        fileMetadata[H.SYMLINK] = metadata.symlinkTarget;
      }
    };

    // Callback called when the response from the worker is an error.
    const workerError = (error: mixed) => {
      if (
        error == null ||
        typeof error !== 'object' ||
        error.message == null ||
        error.stack == null
      ) {
        // $FlowFixMe[reassign-const] - Refactor this
        error = new Error(error);
        // $FlowFixMe[incompatible-use] - error is mixed
        error.stack = ''; // Remove stack for stack-less errors.
      }
      throw error;
    };

    // If we retain all files in the virtual HasteFS representation, we avoid
    // reading them if they aren't important (node_modules).
    if (this._options.retainAllFiles && filePath.includes(NODE_MODULES)) {
      if (computeSha1 || readLink) {
        return this._getWorker(workerOptions)
          .worker({
            computeDependencies: false,
            computeSha1,
            dependencyExtractor: null,
            enableHastePackages: false,
            filePath,
            hasteImplModulePath: null,
            readLink,
            rootDir,
          })
          .then(workerReply, workerError);
      }
      return null;
    }

    // Symlink Haste modules, Haste packages or mocks are not supported - read
    // the target if requested and return early.
    if (isSymlink) {
      if (readLink) {
        // If we only need to read a link, it's more efficient to do it in-band
        // (with async file IO) than to have the overhead of worker IO.
        return this._getWorker({forceInBand: true})
          .worker({
            computeDependencies: false,
            computeSha1: false,
            dependencyExtractor: null,
            enableHastePackages: false,
            filePath,
            hasteImplModulePath: null,
            readLink,
            rootDir,
          })
          .then(workerReply, workerError);
      }
      return null;
    }

    if (
      this._options.mocksPattern &&
      this._options.mocksPattern.test(filePath)
    ) {
      const mockPath = getMockName(filePath);
      const existingMockPath = mockMap.get(mockPath);

      if (existingMockPath != null) {
        const secondMockPath = this._pathUtils.absoluteToNormal(filePath);
        if (existingMockPath !== secondMockPath) {
          const method = this._options.throwOnModuleCollision
            ? 'error'
            : 'warn';

          this._console[method](
            [
              'metro-file-map: duplicate manual mock found: ' + mockPath,
              '  The following files share their name; please delete one of them:',
              '    * <rootDir>' + path.sep + existingMockPath,
              '    * <rootDir>' + path.sep + secondMockPath,
              '',
            ].join('\n'),
          );

          if (this._options.throwOnModuleCollision) {
            throw new DuplicateError(existingMockPath, secondMockPath);
          }
        }
      }

      mockMap.set(mockPath, relativeFilePath);
    }

    return this._getWorker(workerOptions)
      .worker({
        computeDependencies: this._options.computeDependencies,
        computeSha1,
        dependencyExtractor: this._options.dependencyExtractor,
        enableHastePackages: this._options.enableHastePackages,
        filePath,
        hasteImplModulePath: this._options.hasteImplModulePath,
        readLink: false,
        rootDir,
      })
      .then(workerReply, workerError);
  }

  async _applyFileDelta(
    fileSystem: MutableFileSystem,
    hasteMap: MutableHasteMap,
    mockMap: RawMockMap,
    delta: $ReadOnly<{
      changedFiles: FileData,
      removedFiles: $ReadOnlySet<CanonicalPath>,
      clocks?: WatchmanClocks,
    }>,
  ): Promise<void> {
    this._startupPerfLogger?.point('applyFileDelta_start');
    const {changedFiles, removedFiles} = delta;
    this._startupPerfLogger?.point('applyFileDelta_preprocess_start');
    const promises = [];
    const missingFiles: Set<string> = new Set();

    // Remove files first so that we don't mistake moved mocks or Haste
    // modules as duplicates.
    this._startupPerfLogger?.point('applyFileDelta_remove_start');
    for (const relativeFilePath of removedFiles) {
      this._removeIfExists(fileSystem, hasteMap, mockMap, relativeFilePath);
    }
    this._startupPerfLogger?.point('applyFileDelta_remove_end');

    for (const [relativeFilePath, fileData] of changedFiles) {
      // A crawler may preserve the H.VISITED flag to indicate that the file
      // contents are unchaged and it doesn't need visiting again.
      if (fileData[H.VISITED] === 1) {
        continue;
      }

      if (
        this._options.skipPackageJson &&
        relativeFilePath.endsWith(PACKAGE_JSON)
      ) {
        continue;
      }

      // SHA-1, if requested, should already be present thanks to the crawler.
      const filePath = this._pathUtils.normalToAbsolute(relativeFilePath);
      const maybePromise = this._processFile(
        hasteMap,
        mockMap,
        filePath,
        fileData,
        {perfLogger: this._startupPerfLogger},
      );
      if (maybePromise) {
        promises.push(
          maybePromise.catch(e => {
            if (['ENOENT', 'EACCESS'].includes(e.code)) {
              missingFiles.add(relativeFilePath);
            } else {
              throw e;
            }
          }),
        );
      }
    }
    this._startupPerfLogger?.point('applyFileDelta_preprocess_end');

    debug('Visiting %d added/modified files.', promises.length);

    this._startupPerfLogger?.point('applyFileDelta_process_start');
    try {
      await Promise.all(promises);
    } finally {
      await this._cleanup();
    }
    this._startupPerfLogger?.point('applyFileDelta_process_end');
    this._startupPerfLogger?.point('applyFileDelta_add_start');
    for (const relativeFilePath of missingFiles) {
      // It's possible that a file could be deleted between being seen by the
      // crawler and our attempt to process it. For our purposes, this is
      // equivalent to the file being deleted before the crawl, being absent
      // from `changedFiles`, and (if we loaded from cache, and the file
      // existed previously) possibly being reported in `removedFiles`.
      //
      // Treat the file accordingly - don't add it to `FileSystem`, and remove
      // it if it already exists. We're not emitting events at this point in
      // startup, so there's nothing more to do.
      changedFiles.delete(relativeFilePath);
      this._removeIfExists(fileSystem, hasteMap, mockMap, relativeFilePath);
    }
    fileSystem.bulkAddOrModify(changedFiles);
    this._startupPerfLogger?.point('applyFileDelta_add_end');
    this._startupPerfLogger?.point('applyFileDelta_end');
  }

  async _cleanup() {
    const worker = this._worker;

    if (worker && typeof worker.end === 'function') {
      await worker.end();
    }

    this._worker = null;
  }

  /**
   * 4. Serialize a snapshot of our raw data via the configured cache manager
   */
  async _takeSnapshotAndPersist(
    fileSystem: FileSystem,
    clocks: WatchmanClocks,
    hasteMap: MutableHasteMap,
    mockMap: ReadOnlyRawMockMap,
    changed: FileData,
    removed: Set<CanonicalPath>,
  ) {
    this._startupPerfLogger?.point('persist_start');
    await this._cacheManager.write(
      {
        fileSystemData: fileSystem.getSerializableSnapshot(),
        clocks: new Map(clocks),
        mocks: new Map(mockMap),
      },
      {changed, removed},
    );
    this._startupPerfLogger?.point('persist_end');
  }

  /**
   * Creates workers or parses files and extracts metadata in-process.
   */
  _getWorker(options?: {
    forceInBand?: ?boolean,
    perfLogger?: ?PerfLogger,
  }): WorkerInterface {
    if (!this._worker) {
      const {forceInBand, perfLogger} = options ?? {};
      if (forceInBand === true || this._options.maxWorkers <= 1) {
        this._worker = {worker};
      } else {
        const workerPath = require.resolve('./worker');
        perfLogger?.point('initWorkers_start');
        this._worker = new Worker<WorkerObj>(workerPath, {
          exposedMethods: ['worker'],
          maxRetries: 3,
          numWorkers: this._options.maxWorkers,
          enableWorkerThreads: this._options.enableWorkerThreads,
          forkOptions: {
            // Don't pass Node arguments down to workers. In particular, avoid
            // unnecessarily registering Babel when we're running Metro from
            // source (our worker is plain CommonJS).
            execArgv: [],
          },
        });
        perfLogger?.point('initWorkers_end');
      }
    }
    return nullthrows(this._worker);
  }

  _removeIfExists(
    fileSystem: MutableFileSystem,
    hasteMap: MutableHasteMap,
    mockMap: RawMockMap,
    relativeFilePath: Path,
  ) {
    const fileMetadata = fileSystem.remove(relativeFilePath);
    if (fileMetadata == null) {
      return;
    }
    const moduleName = fileMetadata[H.ID] || null; // Empty string indicates no module
    if (moduleName == null) {
      return;
    }

    hasteMap.removeModule(moduleName, relativeFilePath);

    if (this._options.mocksPattern) {
      const absoluteFilePath = path.join(
        this._options.rootDir,
        normalizePathSeparatorsToSystem(relativeFilePath),
      );
      if (
        this._options.mocksPattern &&
        this._options.mocksPattern.test(absoluteFilePath)
      ) {
        const mockName = getMockName(absoluteFilePath);
        mockMap.delete(mockName);
      }
    }
  }

  /**
   * Watch mode
   */
  async _watch(
    fileSystem: MutableFileSystem,
    hasteMap: MutableHasteMap,
    mockMap: RawMockMap,
  ): Promise<void> {
    this._startupPerfLogger?.point('watch_start');
    if (!this._options.watch) {
      this._startupPerfLogger?.point('watch_end');
      return;
    }

    // In watch mode, we'll only warn about module collisions and we'll retain
    // all files, even changes to node_modules.
    this._options.throwOnModuleCollision = false;
    this._options.retainAllFiles = true;

    const hasWatchedExtension = (filePath: string) =>
      this._options.extensions.some(ext => filePath.endsWith(ext));

    let changeQueue: Promise<null | void> = Promise.resolve();
    let nextEmit: ?{
      eventsQueue: EventsQueue,
      firstEventTimestamp: number,
      firstEnqueuedTimestamp: number,
    } = null;

    const emitChange = () => {
      if (nextEmit == null || nextEmit.eventsQueue.length === 0) {
        // Nothing to emit
        return;
      }
      const {eventsQueue, firstEventTimestamp, firstEnqueuedTimestamp} =
        nextEmit;
      const hmrPerfLogger = this._options.perfLoggerFactory?.('HMR', {
        key: this._getNextChangeID(),
      });
      if (hmrPerfLogger != null) {
        hmrPerfLogger.start({timestamp: firstEventTimestamp});
        hmrPerfLogger.point('waitingForChangeInterval_start', {
          timestamp: firstEnqueuedTimestamp,
        });
        hmrPerfLogger.point('waitingForChangeInterval_end');
        hmrPerfLogger.annotate({
          int: {eventsQueueLength: eventsQueue.length},
        });
        hmrPerfLogger.point('fileChange_start');
      }
      const changeEvent: ChangeEvent = {
        logger: hmrPerfLogger,
        eventsQueue,
      };
      this.emit('change', changeEvent);
      nextEmit = null;
    };

    const onChange = (
      type: string,
      filePath: Path,
      root: Path,
      metadata: ?ChangeEventMetadata,
    ) => {
      if (
        metadata &&
        // Ignore all directory events
        (metadata.type === 'd' ||
          // Ignore regular files with unwatched extensions
          (metadata.type === 'f' && !hasWatchedExtension(filePath)) ||
          // Don't emit events relating to symlinks if enableSymlinks: false
          (!this._options.enableSymlinks && metadata?.type === 'l'))
      ) {
        return;
      }

      const absoluteFilePath = path.join(
        root,
        normalizePathSeparatorsToSystem(filePath),
      );

      // Ignore files (including symlinks) whose path matches ignorePattern
      // (we don't ignore node_modules in watch mode)
      if (this._options.ignorePattern.test(absoluteFilePath)) {
        return;
      }

      const relativeFilePath =
        this._pathUtils.absoluteToNormal(absoluteFilePath);
      const linkStats = fileSystem.linkStats(relativeFilePath);

      // The file has been accessed, not modified. If the modified time is
      // null, then it is assumed that the watcher does not have capabilities
      // to detect modified time, and change processing proceeds.
      if (
        type === 'change' &&
        linkStats != null &&
        metadata &&
        metadata.modifiedTime != null &&
        linkStats.modifiedTime === metadata.modifiedTime
      ) {
        return;
      }

      const onChangeStartTime = performance.timeOrigin + performance.now();

      changeQueue = changeQueue
        .then(async () => {
          // If we get duplicate events for the same file, ignore them.
          if (
            nextEmit != null &&
            nextEmit.eventsQueue.find(
              event =>
                event.type === type &&
                event.filePath === absoluteFilePath &&
                ((!event.metadata && !metadata) ||
                  (event.metadata &&
                    metadata &&
                    event.metadata.modifiedTime != null &&
                    metadata.modifiedTime != null &&
                    event.metadata.modifiedTime === metadata.modifiedTime)),
            )
          ) {
            return null;
          }

          const linkStats = fileSystem.linkStats(relativeFilePath);

          const enqueueEvent = (metadata: ChangeEventMetadata) => {
            const event = {
              filePath: absoluteFilePath,
              metadata,
              type,
            };
            if (nextEmit == null) {
              nextEmit = {
                eventsQueue: [event],
                firstEventTimestamp: onChangeStartTime,
                firstEnqueuedTimestamp:
                  performance.timeOrigin + performance.now(),
              };
            } else {
              nextEmit.eventsQueue.push(event);
            }
            return null;
          };

          // If it's not an addition, delete the file and all its metadata
          if (linkStats != null) {
            this._removeIfExists(
              fileSystem,
              hasteMap,
              mockMap,
              relativeFilePath,
            );
          }

          // If the file was added or changed,
          // parse it and update the haste map.
          if (type === 'add' || type === 'change') {
            invariant(
              metadata != null && metadata.size != null,
              'since the file exists or changed, it should have metadata',
            );
            const fileMetadata: FileMetaData = [
              '',
              metadata.modifiedTime,
              metadata.size,
              0,
              '',
              null,
              metadata.type === 'l' ? 1 : 0,
            ];

            try {
              await this._processFile(
                hasteMap,
                mockMap,
                absoluteFilePath,
                fileMetadata,
                {forceInBand: true}, // No need to clean up workers
              );
              fileSystem.addOrModify(relativeFilePath, fileMetadata);
              enqueueEvent(metadata);
            } catch (e) {
              if (!['ENOENT', 'EACCESS'].includes(e.code)) {
                throw e;
              }
              // Swallow ENOENT/ACCESS errors silently. Safe because either:
              // - We never knew about the file, so neither did any consumers.
              // Or,
              // - The watcher will soon (or has already) report a "delete"
              //   event for it, and we'll clean up in the usual way at that
              //   point.
            }
          } else if (type === 'delete') {
            if (linkStats == null) {
              // Don't emit deletion events for files we weren't retaining.
              // This is expected for deletion of an ignored file.
              return null;
            }
            enqueueEvent({
              modifiedTime: null,
              size: null,
              type: linkStats.fileType,
            });
          } else {
            throw new Error(
              `metro-file-map: Unrecognized event type from watcher: ${type}`,
            );
          }
          return null;
        })
        .catch((error: Error) => {
          this._console.error(
            `metro-file-map: watch error:\n  ${error.stack}\n`,
          );
        });
    };

    this._changeInterval = setInterval(emitChange, CHANGE_INTERVAL);

    invariant(
      this._watcher != null,
      'Expected _watcher to have been initialised by build()',
    );
    await this._watcher.watch(onChange);

    if (this._options.healthCheck.enabled) {
      const performHealthCheck = () => {
        if (!this._watcher) {
          return;
        }
        // $FlowFixMe[unused-promise]
        this._watcher
          .checkHealth(this._options.healthCheck.timeout)
          .then(result => {
            this.emit('healthCheck', result);
          });
      };
      performHealthCheck();
      this._healthCheckInterval = setInterval(
        performHealthCheck,
        this._options.healthCheck.interval,
      );
    }
    this._startupPerfLogger?.point('watch_end');
  }

  async end(): Promise<void> {
    if (this._changeInterval) {
      clearInterval(this._changeInterval);
    }
    if (this._healthCheckInterval) {
      clearInterval(this._healthCheckInterval);
    }

    await this._cleanup();

    this._crawlerAbortController.abort();

    await this._watcher?.close();
  }

  /**
   * Helpers
   */
  _ignore(filePath: Path): boolean {
    const ignoreMatched = this._options.ignorePattern.test(filePath);
    return (
      ignoreMatched ||
      (!this._options.retainAllFiles && filePath.includes(NODE_MODULES))
    );
  }

  async _shouldUseWatchman(): Promise<boolean> {
    if (!this._options.useWatchman) {
      return false;
    }
    if (!this._canUseWatchmanPromise) {
      this._canUseWatchmanPromise = checkWatchmanCapabilities(
        WATCHMAN_REQUIRED_CAPABILITIES,
      )
        .then(({version}) => {
          this._startupPerfLogger?.annotate({
            string: {
              watchmanVersion: version,
            },
          });
          return true;
        })
        .catch(e => {
          // TODO: Advise people to either install Watchman or set
          // `useWatchman: false` here?
          this._startupPerfLogger?.annotate({
            string: {
              watchmanFailedCapabilityCheck: e?.message ?? '[missing]',
            },
          });
          return false;
        });
    }
    return this._canUseWatchmanPromise;
  }

  _getNextChangeID(): number {
    if (this._changeID >= Number.MAX_SAFE_INTEGER) {
      this._changeID = 0;
    }
    return ++this._changeID;
  }

  static H: HType = H;
}
