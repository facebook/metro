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
  CacheManagerFactoryOptions,
  CanonicalPath,
  ChangeEvent,
  ChangeEventClock,
  ChangeEventMetadata,
  Console,
  CrawlerOptions,
  EventsQueue,
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
  ProcessFileFunction,
  WatcherBackendChangeEvent,
  WatchmanClocks,
} from './flow-types';

import {DiskCacheManager} from './cache/DiskCacheManager';
import H from './constants';
import checkWatchmanCapabilities from './lib/checkWatchmanCapabilities';
import {FileProcessor} from './lib/FileProcessor';
import normalizePathSeparatorsToPosix from './lib/normalizePathSeparatorsToPosix';
import normalizePathSeparatorsToSystem from './lib/normalizePathSeparatorsToSystem';
import {RootPathUtils} from './lib/RootPathUtils';
import TreeFS from './lib/TreeFS';
import HastePlugin from './plugins/HastePlugin';
import MockPlugin from './plugins/MockPlugin';
import {Watcher} from './Watcher';
import EventEmitter from 'events';
import {promises as fsPromises} from 'fs';
import invariant from 'invariant';
import nullthrows from 'nullthrows';
import * as path from 'path';
import {performance} from 'perf_hooks';

// eslint-disable-next-line import/no-commonjs
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
  plugins?: $ReadOnlyArray<FileMapPlugin<>>,
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
  maxFilesPerWorker?: ?number,
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

type InternalOptions = $ReadOnly<{
  ...BuildParameters,
  healthCheck: HealthCheckOptions,
  perfLoggerFactory: ?PerfLoggerFactory,
  resetCache: ?boolean,
  useWatchman: boolean,
  watch: boolean,
  watchmanDeferStates: $ReadOnlyArray<string>,
}>;

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

// This should be bumped whenever a code change to `metro-file-map` itself
// would cause a change to the cache data structure and/or content (for a given
// filesystem state and build parameters).
const CACHE_BREAKER = '10';

const CHANGE_INTERVAL = 30;

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
export default class FileMap extends EventEmitter {
  _buildPromise: ?Promise<BuildResult>;
  _canUseWatchmanPromise: Promise<boolean>;
  _changeID: number;
  _changeInterval: ?IntervalID;
  _fileProcessor: FileProcessor;
  _console: Console;
  _options: InternalOptions;
  _pathUtils: RootPathUtils;
  _watcher: ?Watcher;
  _cacheManager: CacheManager;
  _crawlerAbortController: AbortController;
  _healthCheckInterval: ?IntervalID;
  _startupPerfLogger: ?PerfLogger;

  #hastePlugin: HastePlugin;
  #mockPlugin: ?MockPlugin = null;
  #plugins: $ReadOnlyArray<FileMapPlugin<>>;

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

    this._console = options.console || global.console;
    const throwOnModuleCollision = Boolean(options.throwOnModuleCollision);

    const enableHastePackages = options.enableHastePackages ?? true;

    this.#hastePlugin = new HastePlugin({
      console: this._console,
      enableHastePackages,
      perfLogger: this._startupPerfLogger,
      platforms: new Set(options.platforms),
      rootDir: options.rootDir,
      failValidationOnConflicts: throwOnModuleCollision,
    });

    const plugins: Array<FileMapPlugin<$FlowFixMe>> = [this.#hastePlugin];

    if (options.mocksPattern != null && options.mocksPattern !== '') {
      this.#mockPlugin = new MockPlugin({
        console: this._console,
        mocksPattern: new RegExp(options.mocksPattern),
        rootDir: options.rootDir,
        throwOnModuleCollision,
      });
      plugins.push(this.#mockPlugin);
    }

    this.#plugins = plugins;

    const buildParameters: BuildParameters = {
      computeDependencies:
        options.computeDependencies == null
          ? true
          : options.computeDependencies,
      computeSha1: options.computeSha1 || false,
      dependencyExtractor: options.dependencyExtractor ?? null,
      enableHastePackages,
      enableSymlinks: options.enableSymlinks || false,
      extensions: options.extensions,
      forceNodeFilesystemAPI: !!options.forceNodeFilesystemAPI,
      hasteImplModulePath: options.hasteImplModulePath,
      ignorePattern,
      plugins: options.plugins ?? [],
      retainAllFiles: options.retainAllFiles,
      rootDir: options.rootDir,
      roots: Array.from(new Set(options.roots)),
      skipPackageJson: !!options.skipPackageJson,
      cacheBreaker: CACHE_BREAKER,
    };

    this._options = {
      ...buildParameters,
      healthCheck: options.healthCheck,
      perfLoggerFactory: options.perfLoggerFactory,
      resetCache: options.resetCache,
      useWatchman: options.useWatchman == null ? true : options.useWatchman,
      watch: !!options.watch,
      watchmanDeferStates: options.watchmanDeferStates ?? [],
    };

    const cacheFactoryOptions: CacheManagerFactoryOptions = {
      buildParameters,
    };
    this._cacheManager = options.cacheManagerFactory
      ? options.cacheManagerFactory.call(null, cacheFactoryOptions)
      : new DiskCacheManager(cacheFactoryOptions, {});

    this._fileProcessor = new FileProcessor({
      dependencyExtractor: buildParameters.dependencyExtractor,
      enableHastePackages: buildParameters.enableHastePackages,
      enableWorkerThreads: options.enableWorkerThreads ?? false,
      hasteImplModulePath: buildParameters.hasteImplModulePath,
      maxFilesPerWorker: options.maxFilesPerWorker,
      maxWorkers: options.maxWorkers,
      perfLogger: this._startupPerfLogger,
    });

    this._buildPromise = null;
    this._pathUtils = new RootPathUtils(options.rootDir);
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
        const processFile: ProcessFileFunction = (
          absolutePath,
          metadata,
          opts,
        ) => {
          const result = this._fileProcessor.processRegularFile(
            absolutePath,
            metadata,
            {
              computeSha1: opts.computeSha1,
              computeDependencies: false,
              maybeReturnContent: true,
            },
          );
          debug('Lazily processed file: %s', absolutePath);
          // Emit an event to inform caches that there is new data to save.
          this.emit('metadata');
          return result?.content;
        };
        const fileSystem =
          initialData != null
            ? TreeFS.fromDeserializedSnapshot({
                rootDir,
                // Typed `mixed` because we've read this from an external
                // source. It'd be too expensive to validate at runtime, so
                // trust our cache manager that this is correct.
                // $FlowFixMe[incompatible-type]
                fileSystemData: initialData.fileSystemData,
                processFile,
              })
            : new TreeFS({rootDir, processFile});
        this._startupPerfLogger?.point('constructFileSystem_end');

        const plugins = this.#plugins;

        // Initialize plugins from cached file system and plugin state while
        // crawling to build a diff of current state vs cached. `fileSystem`
        // is not mutated during either operation.
        const [fileDelta] = await Promise.all([
          this._buildFileDelta({
            fileSystem,
            clocks: initialData?.clocks ?? new Map(),
          }),
          Promise.all(
            plugins.map(plugin =>
              plugin.initialize({
                files: fileSystem,
                pluginState: initialData?.plugins.get(plugin.name),
              }),
            ),
          ),
        ]);

        // Update `fileSystem`, `hasteMap` and `mocks` based on the file delta.
        await this._applyFileDelta(fileSystem, plugins, fileDelta);

        // Validate the mock and Haste maps before persisting them.
        plugins.forEach(plugin => plugin.assertValid());

        const watchmanClocks = new Map(fileDelta.clocks ?? []);
        await this._takeSnapshotAndPersist(
          fileSystem,
          watchmanClocks,
          plugins,
          fileDelta.changedFiles,
          fileDelta.removedFiles,
        );
        debug(
          'Finished mapping files (%d changes, %d removed).',
          fileDelta.changedFiles.size,
          fileDelta.removedFiles.size,
        );

        await this._watch(fileSystem, watchmanClocks, plugins);
        return {
          fileSystem,
          hasteMap: this.#hastePlugin,
          mockMap: this.#mockPlugin,
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
      retainAllFiles,
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
      // TODO: Refactor out the two different ignore strategies here.
      ignoreForCrawl: filePath => {
        const ignoreMatched = ignorePattern.test(filePath);
        return (
          ignoreMatched || (!retainAllFiles && filePath.includes(NODE_MODULES))
        );
      },
      ignorePatternForWatch: ignorePattern,
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

  _maybeReadLink(filePath: Path, fileMetadata: FileMetadata): ?Promise<void> {
    // If we only need to read a link, it's more efficient to do it in-band
    // (with async file IO) than to have the overhead of worker IO.
    if (fileMetadata[H.SYMLINK] === 1) {
      return fsPromises.readlink(filePath).then(symlinkTarget => {
        fileMetadata[H.VISITED] = 1;
        fileMetadata[H.SYMLINK] = symlinkTarget;
      });
    }
    return null;
  }

  async _applyFileDelta(
    fileSystem: MutableFileSystem,
    plugins: $ReadOnlyArray<FileMapPlugin<>>,
    delta: $ReadOnly<{
      changedFiles: FileData,
      removedFiles: $ReadOnlySet<CanonicalPath>,
      clocks?: WatchmanClocks,
    }>,
  ): Promise<void> {
    this._startupPerfLogger?.point('applyFileDelta_start');
    const {changedFiles, removedFiles} = delta;
    this._startupPerfLogger?.point('applyFileDelta_preprocess_start');
    const missingFiles: Set<string> = new Set();

    // Remove files first so that we don't mistake moved mocks or Haste
    // modules as duplicates.
    this._startupPerfLogger?.point('applyFileDelta_remove_start');
    const removed: Array<[string, FileMetadata]> = [];
    for (const relativeFilePath of removedFiles) {
      const metadata = fileSystem.remove(relativeFilePath);
      if (metadata) {
        removed.push([relativeFilePath, metadata]);
      }
    }
    this._startupPerfLogger?.point('applyFileDelta_remove_end');

    const readLinkPromises = [];
    const readLinkErrors: Array<{
      absolutePath: string,
      error: Error & {code?: string},
    }> = [];
    const filesToProcess: Array<[string, FileMetadata]> = [];

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

      if (
        fileData[H.SYMLINK] === 0 &&
        !this._options.computeDependencies &&
        !this._options.computeSha1 &&
        this._options.hasteImplModulePath == null &&
        !(
          this._options.enableHastePackages &&
          relativeFilePath.endsWith(PACKAGE_JSON)
        )
      ) {
        // Nothing to process
        continue;
      }

      // SHA-1, if requested, should already be present thanks to the crawler.
      const absolutePath = this._pathUtils.normalToAbsolute(relativeFilePath);

      if (fileData[H.SYMLINK] === 0) {
        filesToProcess.push([absolutePath, fileData]);
      } else {
        const maybeReadLink = this._maybeReadLink(absolutePath, fileData);
        if (maybeReadLink) {
          readLinkPromises.push(
            maybeReadLink.catch(error =>
              readLinkErrors.push({absolutePath, error}),
            ),
          );
        }
      }
    }
    this._startupPerfLogger?.point('applyFileDelta_preprocess_end');

    debug(
      'Visiting %d added/modified files and %d symlinks.',
      filesToProcess.length,
      readLinkPromises.length,
    );

    this._startupPerfLogger?.point('applyFileDelta_process_start');
    const [batchResult] = await Promise.all([
      this._fileProcessor.processBatch(filesToProcess, {
        computeSha1: this._options.computeSha1,
        computeDependencies: this._options.computeDependencies,
        maybeReturnContent: false,
      }),
      Promise.all(readLinkPromises),
    ]);
    this._startupPerfLogger?.point('applyFileDelta_process_end');

    // It's possible that a file could be deleted between being seen by the
    // crawler and our attempt to process it. For our purposes, this is
    // equivalent to the file being deleted before the crawl, being absent
    // from `changedFiles`, and (if we loaded from cache, and the file
    // existed previously) possibly being reported in `removedFiles`.
    //
    // Treat the file accordingly - don't add it to `FileSystem`, and remove
    // it if it already exists. We're not emitting events at this point in
    // startup, so there's nothing more to do.
    this._startupPerfLogger?.point('applyFileDelta_missing_start');
    for (const {absolutePath, error} of batchResult.errors.concat(
      readLinkErrors,
    )) {
      /* $FlowFixMe[incompatible-type] Error exposed after improved typing of
       * Array.{includes,indexOf,lastIndexOf} */
      if (['ENOENT', 'EACCESS'].includes(error.code)) {
        missingFiles.add(this._pathUtils.absoluteToNormal(absolutePath));
      } else {
        // Anything else is fatal.
        throw error;
      }
    }
    for (const relativeFilePath of missingFiles) {
      changedFiles.delete(relativeFilePath);
      const metadata = fileSystem.remove(relativeFilePath);
      if (metadata) {
        removed.push([relativeFilePath, metadata]);
      }
    }
    this._startupPerfLogger?.point('applyFileDelta_missing_end');

    this._startupPerfLogger?.point('applyFileDelta_add_start');
    fileSystem.bulkAddOrModify(changedFiles);
    this._startupPerfLogger?.point('applyFileDelta_add_end');

    this._startupPerfLogger?.point('applyFileDelta_updatePlugins_start');
    await Promise.all([
      plugins.map(plugin =>
        plugin.bulkUpdate({
          addedOrModified: changedFiles,
          removed,
        }),
      ),
    ]);
    this._startupPerfLogger?.point('applyFileDelta_updatePlugins_end');
    this._startupPerfLogger?.point('applyFileDelta_end');
  }

  /**
   * 4. Serialize a snapshot of our raw data via the configured cache manager
   */
  async _takeSnapshotAndPersist(
    fileSystem: FileSystem,
    clocks: WatchmanClocks,
    plugins: $ReadOnlyArray<FileMapPlugin<>>,
    changed: FileData,
    removed: Set<CanonicalPath>,
  ) {
    this._startupPerfLogger?.point('persist_start');
    await this._cacheManager.write(
      () => ({
        fileSystemData: fileSystem.getSerializableSnapshot(),
        clocks: new Map(clocks),
        plugins: new Map(
          plugins.map(plugin => [
            plugin.name,
            plugin.getSerializableSnapshot(),
          ]),
        ),
      }),
      {
        changedSinceCacheRead: changed.size + removed.size > 0,
        eventSource: {
          onChange: cb => {
            // Inform the cache about changes to internal state, including:
            //  - File system changes
            this.on('change', cb);
            //  - Changes to stored metadata, e.g. on lazy processing.
            this.on('metadata', cb);
            return () => {
              this.removeListener('change', cb);
              this.removeListener('metadata', cb);
            };
          },
        },
        onWriteError: error => {
          this._console.warn('[metro-file-map] Cache write error\n:', error);
        },
      },
    );
    this._startupPerfLogger?.point('persist_end');
  }

  /**
   * Watch mode
   */
  async _watch(
    fileSystem: MutableFileSystem,
    clocks: WatchmanClocks,
    plugins: $ReadOnlyArray<FileMapPlugin<>>,
  ): Promise<void> {
    this._startupPerfLogger?.point('watch_start');
    if (!this._options.watch) {
      this._startupPerfLogger?.point('watch_end');
      return;
    }

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

    const onChange = (change: WatcherBackendChangeEvent) => {
      if (
        change.metadata &&
        // Ignore all directory events
        (change.metadata.type === 'd' ||
          // Ignore regular files with unwatched extensions
          (change.metadata.type === 'f' &&
            !hasWatchedExtension(change.relativePath)) ||
          // Don't emit events relating to symlinks if enableSymlinks: false
          (!this._options.enableSymlinks && change.metadata?.type === 'l'))
      ) {
        return;
      }

      const absoluteFilePath = path.join(
        change.root,
        normalizePathSeparatorsToSystem(change.relativePath),
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
        change.event === 'touch' &&
        linkStats != null &&
        change.metadata.modifiedTime != null &&
        linkStats.modifiedTime === change.metadata.modifiedTime
      ) {
        return;
      }

      // Emitted events, unlike memoryless backend events, specify 'add' or
      // 'change' instead of 'touch'.
      const eventTypeToEmit =
        change.event === 'touch'
          ? linkStats == null
            ? 'add'
            : 'change'
          : 'delete';

      const onChangeStartTime = performance.timeOrigin + performance.now();

      changeQueue = changeQueue
        .then(async () => {
          // If we get duplicate events for the same file, ignore them.
          if (
            nextEmit != null &&
            nextEmit.eventsQueue.find(
              event =>
                event.type === eventTypeToEmit &&
                event.filePath === absoluteFilePath &&
                ((!event.metadata && !change.metadata) ||
                  (event.metadata &&
                    change.metadata &&
                    event.metadata.modifiedTime != null &&
                    change.metadata.modifiedTime != null &&
                    event.metadata.modifiedTime ===
                      change.metadata.modifiedTime)),
            )
          ) {
            return null;
          }

          const linkStats = fileSystem.linkStats(relativeFilePath);

          const enqueueEvent = (metadata: ChangeEventMetadata) => {
            const event = {
              filePath: absoluteFilePath,
              metadata,
              type: eventTypeToEmit,
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

          // If the file was added or modified,
          // parse it and update the haste map.
          if (change.event === 'touch') {
            invariant(
              change.metadata.size != null,
              'since the file exists or changed, it should have known size',
            );
            const fileMetadata: FileMetadata = [
              change.metadata.modifiedTime,
              change.metadata.size,
              0,
              '',
              null,
              change.metadata.type === 'l' ? 1 : 0,
              '',
            ];

            try {
              if (change.metadata.type === 'l') {
                await this._maybeReadLink(absoluteFilePath, fileMetadata);
              } else {
                await this._fileProcessor.processRegularFile(
                  absoluteFilePath,
                  fileMetadata,
                  {
                    computeSha1: this._options.computeSha1,
                    computeDependencies: this._options.computeDependencies,
                    maybeReturnContent: false,
                  },
                );
              }
              fileSystem.addOrModify(relativeFilePath, fileMetadata);
              this._updateClock(clocks, change.clock);
              plugins.forEach(plugin =>
                plugin.onNewOrModifiedFile(relativeFilePath, fileMetadata),
              );
              enqueueEvent(change.metadata);
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
          } else if (change.event === 'delete') {
            if (linkStats == null) {
              // Don't emit deletion events for files we weren't retaining.
              // This is expected for deletion of an ignored file.
              return null;
            }
            // We've already checked linkStats != null above, so the file
            // exists in the file map and remove should always return metadata.
            const metadata = nullthrows(fileSystem.remove(relativeFilePath));
            this._updateClock(clocks, change.clock);
            plugins.forEach(plugin =>
              plugin.onRemovedFile(relativeFilePath, metadata),
            );

            enqueueEvent({
              modifiedTime: null,
              size: null,
              type: linkStats.fileType,
            });
          } else {
            throw new Error(
              `metro-file-map: Unrecognized event type from watcher: ${change.event}`,
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

    this._crawlerAbortController.abort();

    await Promise.all([
      this._fileProcessor.end(),
      this._watcher?.close(),
      this._cacheManager.end(),
    ]);
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

  _updateClock(clocks: WatchmanClocks, newClock?: ?ChangeEventClock): void {
    if (newClock == null) {
      return;
    }
    const [absoluteWatchRoot, clockSpec] = newClock;
    const relativeFsRoot = this._pathUtils.absoluteToNormal(absoluteWatchRoot);
    clocks.set(normalizePathSeparatorsToPosix(relativeFsRoot), clockSpec);
  }

  static H: HType = H;
}
