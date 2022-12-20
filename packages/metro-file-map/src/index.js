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
  CacheManager,
  CacheManagerFactory,
  ChangeEvent,
  ChangeEventMetadata,
  CrawlerOptions,
  Console,
  EventsQueue,
  FileData,
  FileMetaData,
  FileSystem,
  HType,
  InternalData,
  MockData,
  ModuleMapData,
  ModuleMapItem,
  ModuleMetaData,
  Path,
  PerfLoggerFactory,
  PerfLogger,
  WorkerMetadata,
  WatchmanClocks,
} from './flow-types';

import {DiskCacheManager} from './cache/DiskCacheManager';
import H from './constants';
import getMockName from './getMockName';
import HasteFS from './HasteFS';
import checkWatchmanCapabilities from './lib/checkWatchmanCapabilities';
import deepCloneInternalData from './lib/deepCloneInternalData';
import * as fastPath from './lib/fast_path';
import getPlatformExtension from './lib/getPlatformExtension';
import normalizePathSep from './lib/normalizePathSep';
import HasteModuleMap from './ModuleMap';
import {Watcher} from './Watcher';
import {getSha1, worker} from './worker';
import EventEmitter from 'events';
import invariant from 'invariant';
// $FlowFixMe[untyped-import] - jest-regex-util
import {escapePathForRegex} from 'jest-regex-util';
// $FlowFixMe[untyped-import] - jest-worker
import {Worker} from 'jest-worker';
import * as path from 'path';
// $FlowFixMe[untyped-import] - this is a polyfill
import AbortController from 'abort-controller';
import {performance} from 'perf_hooks';
import nullthrows from 'nullthrows';

export type {
  BuildParameters,
  FileData,
  FileSystem,
  HasteMap,
  InternalData,
  ModuleMapData,
  ModuleMapItem,
};

export type InputOptions = $ReadOnly<{
  computeDependencies?: ?boolean,
  computeSha1?: ?boolean,
  enableSymlinks?: ?boolean,
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

  perfLoggerFactory?: ?PerfLoggerFactory,
  resetCache?: ?boolean,
  maxWorkers: number,
  throwOnModuleCollision?: ?boolean,
  useWatchman?: ?boolean,
  watchmanDeferStates?: $ReadOnlyArray<string>,
  watch?: ?boolean,
  console?: Console,
  cacheManagerFactory?: ?CacheManagerFactory,

  healthCheck: HealthCheckOptions,
}>;

type HealthCheckOptions = $ReadOnly<{
  enabled: boolean,
  interval: number,
  timeout: number,
  filePrefix: string,
}>;

type InternalOptions = {
  ...BuildParameters,
  healthCheck: HealthCheckOptions,
  perfLoggerFactory: ?PerfLoggerFactory,
  resetCache: ?boolean,
  maxWorkers: number,
  throwOnModuleCollision: boolean,
  useWatchman: boolean,
  watch: boolean,
  watchmanDeferStates: $ReadOnlyArray<string>,
};

type WorkerInterface = {worker: typeof worker, getSha1: typeof getSha1};

export {default as ModuleMap} from './ModuleMap';
export {DiskCacheManager} from './cache/DiskCacheManager';
export {DuplicateHasteCandidatesError} from './lib/DuplicateHasteCandidatesError';
export type {IModuleMap} from './flow-types';
export type {default as FS} from './HasteFS';
export type {HealthCheckResult} from './Watcher';
export type {
  CacheManager,
  CacheManagerFactory,
  ChangeEvent,
  WatcherStatus,
} from './flow-types';

// This should be bumped whenever a code change to `metro-file-map` itself
// would cause a change to the cache data structure and/or content (for a given
// filesystem state and build parameters).
const CACHE_BREAKER = '2';

const CHANGE_INTERVAL = 30;
const NODE_MODULES = path.sep + 'node_modules' + path.sep;
const PACKAGE_JSON = path.sep + 'package.json';
const VCS_DIRECTORIES = ['.git', '.hg']
  .map(vcs => escapePathForRegex(path.sep + vcs + path.sep))
  .join('|');
const WATCHMAN_REQUIRED_CAPABILITIES = [
  'field-content.sha1hex',
  'relative_root',
  'suffix-set',
  'wildmatch',
];

/**
 * HasteMap is a JavaScript implementation of Facebook's haste module system.
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
 * type HasteMap = {
 *   clocks: WatchmanClocks,
 *   files: {[filepath: string]: FileMetaData},
 *   map: {[id: string]: ModuleMapItem},
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
 * };
 *
 * // Modules can be targeted to a specific platform based on the file name.
 * // Example: platform.ios.js and Platform.android.js will both map to the same
 * // `Platform` module. The platform should be specified during resolution.
 * type ModuleMapItem = {[platform: string]: ModuleMetaData};
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
export default class HasteMap extends EventEmitter {
  _buildPromise: ?Promise<BuildResult>;
  _canUseWatchmanPromise: Promise<boolean>;
  _changeID: number;
  _changeInterval: ?IntervalID;
  _console: Console;
  _options: InternalOptions;
  _watcher: ?Watcher;
  _worker: ?WorkerInterface;
  _cacheManager: CacheManager;
  _crawlerAbortController: typeof AbortController;
  _healthCheckInterval: ?IntervalID;
  _startupPerfLogger: ?PerfLogger;

  static create(options: InputOptions): HasteMap {
    return new HasteMap(options);
  }

  // $FlowFixMe[missing-local-annot]
  constructor(options: InputOptions) {
    super();

    if (options.perfLoggerFactory) {
      this._startupPerfLogger =
        options.perfLoggerFactory?.().subSpan('hasteMap') ?? null;
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

    if (this._options.enableSymlinks && this._options.useWatchman) {
      throw new Error(
        'metro-file-map: enableSymlinks config option was set, but ' +
          'is incompatible with watchman.\n' +
          'Set either `enableSymlinks` to false or `useWatchman` to false.',
      );
    }

    this._buildPromise = null;
    this._worker = null;
    this._startupPerfLogger?.point('constructor_end');
    this._crawlerAbortController = new AbortController();
    this._changeID = 0;
  }

  build(): Promise<BuildResult> {
    this._startupPerfLogger?.point('build_start');
    if (!this._buildPromise) {
      this._buildPromise = (async () => {
        let initialData: InternalData;
        try {
          initialData =
            this._options.resetCache === true
              ? this._createEmptyMap()
              : await this.read();
        } catch {
          initialData = this._createEmptyMap();
        }

        const fileDelta = await this._buildFileDelta({
          files: initialData.files,
          clocks: initialData.clocks,
        });

        let data: InternalData;
        if (
          fileDelta.changedFiles.size > 0 ||
          fileDelta.removedFiles.size > 0
        ) {
          data = await this._applyFileDelta(initialData, fileDelta);
        } else if (fileDelta.clocks) {
          data = {...initialData, clocks: fileDelta.clocks};
        } else {
          data = initialData;
        }

        await this._takeSnapshotAndPersist(
          data,
          fileDelta.changedFiles,
          fileDelta.removedFiles,
        );

        const rootDir = this._options.rootDir;
        const fileSystem = new HasteFS({
          files: data.files,
          rootDir,
        });
        const hasteModuleMap = new HasteModuleMap({
          duplicates: data.duplicates,
          map: data.map,
          mocks: data.mocks,
          rootDir,
        });

        await this._watch(data);
        return {
          fileSystem,
          hasteModuleMap,
        };
      })();
    }
    return this._buildPromise.then(result => {
      this._startupPerfLogger?.point('build_end');
      return result;
    });
  }

  /**
   * 1. read data from the cache or create an empty structure.
   */
  async read(): Promise<InternalData> {
    let data: ?InternalData;

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
    data = data ?? this._createEmptyMap();
    this._startupPerfLogger?.point('read_end');

    return data;
  }

  /**
   * 2. crawl the file system.
   */
  async _buildFileDelta(
    previousState: CrawlerOptions['previousState'],
  ): Promise<{
    removedFiles: FileData,
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
    hasteMap: InternalData,
    map: ModuleMapData,
    mocks: MockData,
    filePath: Path,
    workerOptions?: {forceInBand: boolean},
  ): ?Promise<void> {
    const rootDir = this._options.rootDir;

    const setModule = (id: string, module: ModuleMetaData) => {
      let moduleMap = map.get(id);
      if (!moduleMap) {
        // $FlowFixMe[unclear-type] - Add type coverage
        moduleMap = (Object.create(null): any);
        map.set(id, moduleMap);
      }
      const platform =
        getPlatformExtension(module[H.PATH], this._options.platforms) ||
        H.GENERIC_PLATFORM;

      const existingModule = moduleMap[platform];

      if (existingModule && existingModule[H.PATH] !== module[H.PATH]) {
        const method = this._options.throwOnModuleCollision ? 'error' : 'warn';

        this._console[method](
          [
            'metro-file-map: Haste module naming collision: ' + id,
            '  The following files share their name; please adjust your hasteImpl:',
            '    * <rootDir>' + path.sep + existingModule[H.PATH],
            '    * <rootDir>' + path.sep + module[H.PATH],
            '',
          ].join('\n'),
        );

        if (this._options.throwOnModuleCollision) {
          throw new DuplicateError(existingModule[H.PATH], module[H.PATH]);
        }

        // We do NOT want consumers to use a module that is ambiguous.
        delete moduleMap[platform];

        if (Object.keys(moduleMap).length === 1) {
          map.delete(id);
        }

        let dupsByPlatform = hasteMap.duplicates.get(id);
        if (dupsByPlatform == null) {
          dupsByPlatform = new Map();
          hasteMap.duplicates.set(id, dupsByPlatform);
        }

        const dups = new Map([
          [module[H.PATH], module[H.TYPE]],
          [existingModule[H.PATH], existingModule[H.TYPE]],
        ]);
        dupsByPlatform.set(platform, dups);

        return;
      }

      const dupsByPlatform = hasteMap.duplicates.get(id);
      if (dupsByPlatform != null) {
        const dups = dupsByPlatform.get(platform);
        if (dups != null) {
          dups.set(module[H.PATH], module[H.TYPE]);
        }
        return;
      }

      moduleMap[platform] = module;
    };

    const relativeFilePath = fastPath.relative(rootDir, filePath);
    const fileMetadata = hasteMap.files.get(relativeFilePath);
    if (!fileMetadata) {
      throw new Error(
        'metro-file-map: File to process was not found in the haste map.',
      );
    }

    const moduleMetadata = hasteMap.map.get(fileMetadata[H.ID]);
    const computeSha1 = this._options.computeSha1 && !fileMetadata[H.SHA1];

    // Callback called when the response from the worker is successful.
    const workerReply = (metadata: WorkerMetadata) => {
      // `1` for truthy values instead of `true` to save cache space.
      fileMetadata[H.VISITED] = 1;

      const metadataId = metadata.id;
      const metadataModule = metadata.module;

      if (metadataId != null && metadataModule) {
        fileMetadata[H.ID] = metadataId;
        setModule(metadataId, metadataModule);
      }

      fileMetadata[H.DEPENDENCIES] = metadata.dependencies
        ? metadata.dependencies.join(H.DEPENDENCY_DELIM)
        : '';

      if (computeSha1) {
        fileMetadata[H.SHA1] = metadata.sha1;
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

      // $FlowFixMe[incompatible-use] - error is mixed
      if (!['ENOENT', 'EACCES'].includes(error.code)) {
        throw error;
      }

      // If a file cannot be read we remove it from the file list and
      // ignore the failure silently.
      hasteMap.files.delete(relativeFilePath);
    };

    // If we retain all files in the virtual HasteFS representation, we avoid
    // reading them if they aren't important (node_modules).
    if (this._options.retainAllFiles && filePath.includes(NODE_MODULES)) {
      if (computeSha1) {
        return this._getWorker(workerOptions)
          .getSha1({
            computeDependencies: this._options.computeDependencies,
            computeSha1,
            dependencyExtractor: this._options.dependencyExtractor,
            filePath,
            hasteImplModulePath: this._options.hasteImplModulePath,
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
      const existingMockPath = mocks.get(mockPath);

      if (existingMockPath != null) {
        const secondMockPath = fastPath.relative(rootDir, filePath);
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

      mocks.set(mockPath, relativeFilePath);
    }

    if (fileMetadata[H.VISITED]) {
      if (!fileMetadata[H.ID]) {
        return null;
      }

      if (moduleMetadata != null) {
        const platform =
          getPlatformExtension(filePath, this._options.platforms) ||
          H.GENERIC_PLATFORM;

        const module = moduleMetadata[platform];

        if (module == null) {
          return null;
        }

        const moduleId = fileMetadata[H.ID];
        let modulesByPlatform = map.get(moduleId);
        if (!modulesByPlatform) {
          // $FlowFixMe[unclear-type] - ModuleMapItem?
          modulesByPlatform = (Object.create(null): any);
          map.set(moduleId, modulesByPlatform);
        }
        modulesByPlatform[platform] = module;

        return null;
      }
    }

    return this._getWorker(workerOptions)
      .worker({
        computeDependencies: this._options.computeDependencies,
        computeSha1,
        dependencyExtractor: this._options.dependencyExtractor,
        filePath,
        hasteImplModulePath: this._options.hasteImplModulePath,
        rootDir,
      })
      .then(workerReply, workerError);
  }

  _applyFileDelta(
    data: InternalData,
    delta: {
      changedFiles: FileData,
      removedFiles: FileData,
      clocks?: WatchmanClocks,
    },
  ): Promise<InternalData> {
    this._startupPerfLogger?.point('applyFileDelta_start');
    const {changedFiles, removedFiles, clocks} = delta;
    data.clocks = clocks ?? new Map();

    for (const [relativeFilePath] of removedFiles) {
      this._removeIfExists(data, relativeFilePath);
    }

    for (const [relativeFilePath, fileMetadata] of changedFiles) {
      data.files.set(relativeFilePath, fileMetadata);
    }

    const promises = [];
    for (const relativeFilePath of changedFiles.keys()) {
      if (
        this._options.skipPackageJson &&
        relativeFilePath.endsWith(PACKAGE_JSON)
      ) {
        continue;
      }
      // SHA-1, if requested, should already be present thanks to the crawler.
      const filePath = fastPath.resolve(
        this._options.rootDir,
        relativeFilePath,
      );
      const promise = this._processFile(data, data.map, data.mocks, filePath);
      if (promise) {
        promises.push(promise);
      }
    }

    return Promise.all(promises).then(
      () => {
        this._cleanup();
        this._startupPerfLogger?.point('applyFileDelta_end');
        return data;
      },
      error => {
        this._cleanup();
        throw error;
      },
    );
  }

  _cleanup() {
    const worker = this._worker;

    // $FlowFixMe[prop-missing] - end is not on WorkerInterface
    if (worker && typeof worker.end === 'function') {
      worker.end();
    }

    this._worker = null;
  }

  /**
   * 4. Serialize a snapshot of our raw data via the configured cache manager
   */
  async _takeSnapshotAndPersist(
    data: InternalData,
    changed: FileData,
    removed: FileData,
  ) {
    this._startupPerfLogger?.point('persist_start');
    // We must take a snapshot here synchronously, because `data` is only
    // internally consistent immediately after crawling - we do not update
    // `data.clocks` on changes.
    //
    // TODO: Make this more explicit
    const snapshot = deepCloneInternalData(data);
    await this._cacheManager.write(snapshot, {changed, removed});
    this._startupPerfLogger?.point('persist_end');
  }

  /**
   * Creates workers or parses files and extracts metadata in-process.
   */
  _getWorker(options?: {forceInBand: boolean}): WorkerInterface {
    if (!this._worker) {
      if ((options && options.forceInBand) || this._options.maxWorkers <= 1) {
        this._worker = {getSha1, worker};
      } else {
        this._worker = new Worker(require.resolve('./worker'), {
          exposedMethods: ['getSha1', 'worker'],
          maxRetries: 3,
          numWorkers: this._options.maxWorkers,
        });
      }
    }

    return this._worker;
  }

  _getSnapshot(data: InternalData): {
    snapshotFS: FileSystem,
    moduleMap: HasteModuleMap,
  } {
    const rootDir = this._options.rootDir;
    return {
      snapshotFS: new HasteFS({
        files: new Map(data.files),
        rootDir,
      }),
      moduleMap: new HasteModuleMap({
        duplicates: new Map(data.duplicates),
        map: new Map(data.map),
        mocks: new Map(data.mocks),
        rootDir,
      }),
    };
  }

  _removeIfExists(data: InternalData, relativeFilePath: Path) {
    const fileMetadata = data.files.get(relativeFilePath);
    if (!fileMetadata) {
      return;
    }
    const moduleName = fileMetadata[H.ID];
    const platform =
      getPlatformExtension(relativeFilePath, this._options.platforms) ||
      H.GENERIC_PLATFORM;
    data.files.delete(relativeFilePath);

    let moduleMap = data.map.get(moduleName);
    if (moduleMap != null) {
      // We are forced to copy the object because metro-file-map exposes
      // the map as an immutable entity.
      moduleMap = Object.assign(Object.create(null), moduleMap);
      delete moduleMap[platform];
      if (Object.keys(moduleMap).length === 0) {
        data.map.delete(moduleName);
      } else {
        data.map.set(moduleName, moduleMap);
      }
    }

    if (this._options.mocksPattern) {
      const absoluteFilePath = path.join(
        this._options.rootDir,
        normalizePathSep(relativeFilePath),
      );
      if (
        this._options.mocksPattern &&
        this._options.mocksPattern.test(absoluteFilePath)
      ) {
        const mockName = getMockName(absoluteFilePath);
        data.mocks.delete(mockName);
      }
    }

    this._recoverDuplicates(data, relativeFilePath, moduleName);
  }

  /**
   * Watch mode
   */
  async _watch(data: InternalData): Promise<void> {
    this._startupPerfLogger?.point('watch_start');
    if (!this._options.watch) {
      this._startupPerfLogger?.point('watch_end');
      return;
    }

    // In watch mode, we'll only warn about module collisions and we'll retain
    // all files, even changes to node_modules.
    this._options.throwOnModuleCollision = false;
    this._options.retainAllFiles = true;

    const extensions = this._options.extensions;
    const rootDir = this._options.rootDir;

    let changeQueue: Promise<null | void> = Promise.resolve();
    let eventsQueue: EventsQueue = [];
    let eventStartTimestamp = null;

    const emitChange = () => {
      if (eventsQueue.length) {
        const hmrPerfLogger = this._options.perfLoggerFactory?.('HMR', {
          key: this._getNextChangeID(),
        });
        if (hmrPerfLogger != null) {
          hmrPerfLogger.start({timestamp: nullthrows(eventStartTimestamp)});
          hmrPerfLogger.point('waitingForChangeInterval_start', {
            timestamp: nullthrows(eventStartTimestamp),
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
          ...this._getSnapshot(data),
        };
        this.emit('change', changeEvent);
        eventsQueue = [];
        eventStartTimestamp = null;
      }
    };

    const onChange = (
      type: string,
      filePath: Path,
      root: Path,
      metadata: ?ChangeEventMetadata,
    ) => {
      const absoluteFilePath = path.join(root, normalizePathSep(filePath));
      if (
        (metadata && metadata.type === 'd') ||
        this._ignore(absoluteFilePath) ||
        !extensions.some(extension => absoluteFilePath.endsWith(extension))
      ) {
        return;
      }

      const relativeFilePath = fastPath.relative(rootDir, absoluteFilePath);
      const fileMetadata = data.files.get(relativeFilePath);

      // The file has been accessed, not modified
      if (
        type === 'change' &&
        fileMetadata &&
        metadata &&
        fileMetadata[H.MTIME] === metadata.modifiedTime
      ) {
        return;
      }

      if (eventStartTimestamp == null) {
        eventStartTimestamp = performance.timeOrigin + performance.now();
      }

      changeQueue = changeQueue
        .then(() => {
          // If we get duplicate events for the same file, ignore them.
          if (
            eventsQueue.find(
              event =>
                event.type === type &&
                event.filePath === absoluteFilePath &&
                ((!event.metadata && !metadata) ||
                  (event.metadata &&
                    metadata &&
                    event.metadata.modifiedTime === metadata.modifiedTime)),
            )
          ) {
            return null;
          }

          const add = () => {
            eventsQueue.push({
              filePath: absoluteFilePath,
              metadata,
              type,
            });
            return null;
          };

          const fileMetadata = data.files.get(relativeFilePath);

          // If it's not an addition, delete the file and all its metadata
          if (fileMetadata != null) {
            this._removeIfExists(data, relativeFilePath);
          }

          // If the file was added or changed,
          // parse it and update the haste map.
          if (type === 'add' || type === 'change') {
            invariant(
              metadata,
              'since the file exists or changed, it should have metadata',
            );
            const fileMetadata: FileMetaData = [
              '',
              metadata.modifiedTime,
              metadata.size,
              0,
              '',
              null,
            ];
            data.files.set(relativeFilePath, fileMetadata);
            const promise = this._processFile(
              data,
              data.map,
              data.mocks,
              absoluteFilePath,
              {forceInBand: true},
            );
            // Cleanup
            this._cleanup();
            if (promise) {
              return promise.then(add);
            } else {
              // If a file in node_modules has changed,
              // emit an event regardless.
              add();
            }
          } else {
            add();
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

  /**
   * This function should be called when the file under `filePath` is removed
   * or changed. When that happens, we want to figure out if that file was
   * part of a group of files that had the same ID. If it was, we want to
   * remove it from the group. Furthermore, if there is only one file
   * remaining in the group, then we want to restore that single file as the
   * correct resolution for its ID, and cleanup the duplicates index.
   */
  _recoverDuplicates(
    hasteMap: InternalData,
    relativeFilePath: string,
    moduleName: string,
  ) {
    let dupsByPlatform = hasteMap.duplicates.get(moduleName);
    if (dupsByPlatform == null) {
      return;
    }

    const platform =
      getPlatformExtension(relativeFilePath, this._options.platforms) ||
      H.GENERIC_PLATFORM;
    let dups = dupsByPlatform.get(platform);
    if (dups == null) {
      return;
    }

    dupsByPlatform = new Map(dupsByPlatform);
    hasteMap.duplicates.set(moduleName, dupsByPlatform);

    dups = new Map(dups);
    dupsByPlatform.set(platform, dups);
    dups.delete(relativeFilePath);

    if (dups.size !== 1) {
      return;
    }

    const uniqueModule = dups.entries().next().value;

    if (!uniqueModule) {
      return;
    }

    let dedupMap = hasteMap.map.get(moduleName);

    if (dedupMap == null) {
      // $FlowFixMe[unclear-type] - ModuleMapItem?
      dedupMap = (Object.create(null): any);
      hasteMap.map.set(moduleName, dedupMap);
    }
    dedupMap[platform] = uniqueModule;
    dupsByPlatform.delete(platform);
    if (dupsByPlatform.size === 0) {
      hasteMap.duplicates.delete(moduleName);
    }
  }

  async end(): Promise<void> {
    if (this._changeInterval) {
      clearInterval(this._changeInterval);
    }
    if (this._healthCheckInterval) {
      clearInterval(this._healthCheckInterval);
    }

    if (!this._watcher) {
      return;
    }
    await this._watcher.close();
    this._crawlerAbortController.abort();
  }

  /**
   * Helpers
   */
  _ignore(filePath: Path): boolean {
    const ignorePattern = this._options.ignorePattern;
    const ignoreMatched =
      ignorePattern instanceof RegExp
        ? ignorePattern.test(filePath)
        : ignorePattern && ignorePattern(filePath);

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
        .then(() => true)
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

  _createEmptyMap(): InternalData {
    return {
      clocks: new Map(),
      duplicates: new Map(),
      files: new Map(),
      map: new Map(),
      mocks: new Map(),
    };
  }

  _getNextChangeID(): number {
    if (this._changeID >= Number.MAX_SAFE_INTEGER) {
      this._changeID = 0;
    }
    return ++this._changeID;
  }

  static H: HType = H;
}

export class DuplicateError extends Error {
  mockPath1: string;
  mockPath2: string;

  constructor(mockPath1: string, mockPath2: string) {
    super('Duplicated files or mocks. Please check the console for more info');

    this.mockPath1 = mockPath1;
    this.mockPath2 = mockPath2;
  }
}
