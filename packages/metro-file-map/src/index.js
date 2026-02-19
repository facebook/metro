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
  FileMapPluginWorker,
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

export type InputOptions = Readonly<{
  computeSha1?: ?boolean,
  enableSymlinks?: ?boolean,
  extensions: ReadonlyArray<string>,
  forceNodeFilesystemAPI?: ?boolean,
  ignorePattern?: ?RegExp,
  plugins?: ReadonlyArray<AnyFileMapPlugin>,
  retainAllFiles: boolean,
  rootDir: string,
  roots: ReadonlyArray<string>,

  cacheManagerFactory?: ?CacheManagerFactory,
  console?: Console,
  healthCheck: HealthCheckOptions,
  maxFilesPerWorker?: ?number,
  maxWorkers: number,
  perfLoggerFactory?: ?PerfLoggerFactory,
  resetCache?: ?boolean,
  useWatchman?: ?boolean,
  watch?: ?boolean,
  watchmanDeferStates?: ReadonlyArray<string>,
}>;

type HealthCheckOptions = Readonly<{
  enabled: boolean,
  interval: number,
  timeout: number,
  filePrefix: string,
}>;

type InternalOptions = Readonly<{
  ...BuildParameters,
  healthCheck: HealthCheckOptions,
  perfLoggerFactory: ?PerfLoggerFactory,
  resetCache: ?boolean,
  useWatchman: boolean,
  watch: boolean,
  watchmanDeferStates: ReadonlyArray<string>,
}>;

// $FlowFixMe[unclear-type] Plugin types cannot be known statically
type AnyFileMapPlugin = FileMapPlugin<any, any>;
type IndexedPlugin = Readonly<{
  plugin: AnyFileMapPlugin,
  dataIdx: ?number,
}>;

export {DiskCacheManager} from './cache/DiskCacheManager';
export {default as DependencyPlugin} from './plugins/DependencyPlugin';
export type {DependencyPluginOptions} from './plugins/DependencyPlugin';
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
const CACHE_BREAKER = '11';

const CHANGE_INTERVAL = 30;

const NODE_MODULES = path.sep + 'node_modules' + path.sep;
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
 * Because the file map creation and synchronization is critical to startup
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
 * The FileMap is created as follows:
 *  1. read data from the cache or create an empty structure.
 *
 *  2. crawl the file system.
 *     * empty cache: crawl the entire file system.
 *     * cache available:
 *       * if watchman is available: get file system delta changes.
 *       * if watchman is unavailable: crawl the entire file system.
 *     * build metadata objects for every file. This builds the `files` part of
 *       the `FileMap`.
 *
 *  3. visit and extract metadata from changed files, including sha1,
 *     depedendencies, and any plugins.
 *     * this is done in parallel over worker processes to improve performance.
 *     * the worst case is to visit all files.
 *     * the best case is no file system access and retrieving all data from
 *       the cache.
 *     * the average case is a small number of changed files.
 *
 *  4. serialize the new `FileMap` in a cache file.
 *
 */
export default class FileMap extends EventEmitter {
  #buildPromise: ?Promise<BuildResult>;
  +#cacheManager: CacheManager;
  #canUseWatchmanPromise: Promise<boolean>;
  #changeID: number;
  #changeInterval: ?IntervalID;
  +#console: Console;
  +#crawlerAbortController: AbortController;
  +#fileProcessor: FileProcessor;
  #healthCheckInterval: ?IntervalID;
  +#options: InternalOptions;
  +#pathUtils: RootPathUtils;
  +#plugins: ReadonlyArray<IndexedPlugin>;
  +#startupPerfLogger: ?PerfLogger;
  #watcher: ?Watcher;

  static create(options: InputOptions): FileMap {
    return new FileMap(options);
  }

  constructor(options: InputOptions) {
    super();

    if (options.perfLoggerFactory) {
      this.#startupPerfLogger =
        options.perfLoggerFactory?.('START_UP').subSpan('fileMap') ?? null;
      this.#startupPerfLogger?.point('constructor_start');
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

    this.#console = options.console || global.console;

    let dataSlot: number = H.PLUGINDATA;

    const indexedPlugins: Array<IndexedPlugin> = [];
    const pluginWorkers: Array<FileMapPluginWorker> = [];
    const plugins = options.plugins ?? [];
    for (const plugin of plugins) {
      const maybeWorker = plugin.getWorker();
      indexedPlugins.push({
        plugin,
        dataIdx: maybeWorker != null ? dataSlot++ : null,
      });
      if (maybeWorker != null) {
        pluginWorkers.push(maybeWorker);
      }
    }
    this.#plugins = indexedPlugins;

    const buildParameters: BuildParameters = {
      cacheBreaker: CACHE_BREAKER,
      computeSha1: options.computeSha1 || false,
      enableSymlinks: options.enableSymlinks || false,
      extensions: options.extensions,
      forceNodeFilesystemAPI: !!options.forceNodeFilesystemAPI,
      ignorePattern,
      plugins,
      retainAllFiles: options.retainAllFiles,
      rootDir: options.rootDir,
      roots: Array.from(new Set(options.roots)),
    };

    this.#options = {
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
    this.#cacheManager = options.cacheManagerFactory
      ? options.cacheManagerFactory.call(null, cacheFactoryOptions)
      : new DiskCacheManager(cacheFactoryOptions, {});

    this.#fileProcessor = new FileProcessor({
      maxFilesPerWorker: options.maxFilesPerWorker,
      maxWorkers: options.maxWorkers,
      perfLogger: this.#startupPerfLogger,
      pluginWorkers,
      rootDir: options.rootDir,
    });

    this.#buildPromise = null;
    this.#pathUtils = new RootPathUtils(options.rootDir);
    this.#startupPerfLogger?.point('constructor_end');
    this.#crawlerAbortController = new AbortController();
    this.#changeID = 0;
  }

  build(): Promise<BuildResult> {
    this.#startupPerfLogger?.point('build_start');
    if (!this.#buildPromise) {
      this.#buildPromise = (async () => {
        let initialData: ?CacheData;
        if (this.#options.resetCache !== true) {
          initialData = await this.read();
        }
        if (!initialData) {
          debug('Not using a cache');
        } else {
          debug('Cache loaded (%d clock(s))', initialData.clocks.size);
        }

        const rootDir = this.#options.rootDir;
        this.#startupPerfLogger?.point('constructFileSystem_start');
        const processFile: ProcessFileFunction = (
          normalPath,
          metadata,
          opts,
        ) => {
          const result = this.#fileProcessor.processRegularFile(
            normalPath,
            metadata,
            {
              computeSha1: opts.computeSha1,
              maybeReturnContent: true,
            },
          );
          debug('Lazily processed file: %s', normalPath);
          // Emit an event to inform caches that there is new data to save.
          this.emit('metadata');
          return result?.content;
        };
        const fileSystem =
          initialData != null
            ? TreeFS.fromDeserializedSnapshot({
                // Typed `mixed` because we've read this from an external
                // source. It'd be too expensive to validate at runtime, so
                // trust our cache manager that this is correct.
                // $FlowFixMe[incompatible-type]
                fileSystemData: initialData.fileSystemData,
                processFile,
                rootDir,
              })
            : new TreeFS({processFile, rootDir});
        this.#startupPerfLogger?.point('constructFileSystem_end');

        const plugins = this.#plugins;

        // Initialize plugins from cached file system and plugin state while
        // crawling to build a diff of current state vs cached. `fileSystem`
        // is not mutated during either operation.
        const [fileDelta] = await Promise.all([
          this.#buildFileDelta({
            clocks: initialData?.clocks ?? new Map(),
            fileSystem,
          }),
          Promise.all(
            plugins.map(({plugin, dataIdx}) =>
              plugin.initialize({
                files: {
                  lookup: mixedPath => {
                    const result = fileSystem.lookup(mixedPath);
                    if (!result.exists) {
                      return {exists: false};
                    }
                    if (result.type === 'd') {
                      return {exists: true, type: 'd'};
                    }
                    return {
                      exists: true,
                      type: 'f',
                      pluginData:
                        dataIdx != null ? result.metadata[dataIdx] : null,
                    };
                  },
                  fileIterator: opts =>
                    mapIterator(
                      fileSystem.metadataIterator(opts),
                      ({baseName, canonicalPath, metadata}) => ({
                        baseName,
                        canonicalPath,
                        pluginData: dataIdx != null ? metadata[dataIdx] : null,
                      }),
                    ),
                },
                pluginState: initialData?.plugins.get(plugin.name),
              }),
            ),
          ),
        ]);

        // Update `fileSystem` and plugins based on the file delta.
        await this.#applyFileDelta(fileSystem, plugins, fileDelta);

        // Validate plugins before persisting them.
        plugins.forEach(({plugin}) => plugin.assertValid());

        const watchmanClocks = new Map(fileDelta.clocks ?? []);
        await this.#takeSnapshotAndPersist(
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

        await this.#watch(fileSystem, watchmanClocks, plugins);
        return {fileSystem};
      })();
    }
    return this.#buildPromise.then(result => {
      this.#startupPerfLogger?.point('build_end');
      return result;
    });
  }

  /**
   * 1. read data from the cache or create an empty structure.
   */
  async read(): Promise<?CacheData> {
    let data: ?CacheData;
    this.#startupPerfLogger?.point('read_start');
    try {
      data = await this.#cacheManager.read();
    } catch (e) {
      this.#console.warn(
        'Error while reading cache, falling back to a full crawl:\n',
        e,
      );
      this.#startupPerfLogger?.annotate({
        string: {cacheReadError: e.toString()},
      });
    }
    this.#startupPerfLogger?.point('read_end');
    return data;
  }

  /**
   * 2. crawl the file system.
   */
  async #buildFileDelta(
    previousState: CrawlerOptions['previousState'],
  ): Promise<{
    removedFiles: Set<CanonicalPath>,
    changedFiles: FileData,
    clocks?: WatchmanClocks,
  }> {
    this.#startupPerfLogger?.point('buildFileDelta_start');

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
    } = this.#options;

    this.#watcher = new Watcher({
      abortSignal: this.#crawlerAbortController.signal,
      computeSha1,
      console: this.#console,
      enableSymlinks,
      extensions,
      forceNodeFilesystemAPI,
      healthCheckFilePrefix: this.#options.healthCheck.filePrefix,
      // TODO: Refactor out the two different ignore strategies here.
      ignoreForCrawl: filePath => {
        const ignoreMatched = ignorePattern.test(filePath);
        return (
          ignoreMatched || (!retainAllFiles && filePath.includes(NODE_MODULES))
        );
      },
      ignorePatternForWatch: ignorePattern,
      perfLogger: this.#startupPerfLogger,
      previousState,
      rootDir,
      roots,
      useWatchman: await this.#shouldUseWatchman(),
      watch,
      watchmanDeferStates,
    });
    const watcher = this.#watcher;

    watcher.on('status', status => this.emit('status', status));

    return watcher.crawl().then(result => {
      this.#startupPerfLogger?.point('buildFileDelta_end');
      return result;
    });
  }

  #maybeReadLink(normalPath: Path, fileMetadata: FileMetadata): ?Promise<void> {
    // If we only need to read a link, it's more efficient to do it in-band
    // (with async file IO) than to have the overhead of worker IO.
    if (fileMetadata[H.SYMLINK] === 1) {
      return fsPromises
        .readlink(this.#pathUtils.normalToAbsolute(normalPath))
        .then(symlinkTarget => {
          fileMetadata[H.VISITED] = 1;
          fileMetadata[H.SYMLINK] = symlinkTarget;
        });
    }
    return null;
  }

  async #applyFileDelta(
    fileSystem: MutableFileSystem,
    plugins: ReadonlyArray<IndexedPlugin>,
    delta: Readonly<{
      changedFiles: FileData,
      removedFiles: ReadonlySet<CanonicalPath>,
      clocks?: WatchmanClocks,
    }>,
  ): Promise<void> {
    this.#startupPerfLogger?.point('applyFileDelta_start');
    const {changedFiles, removedFiles} = delta;
    this.#startupPerfLogger?.point('applyFileDelta_preprocess_start');
    const missingFiles: Set<string> = new Set();

    // Remove files first so that we don't mistake moved modules
    // modules as duplicates.
    this.#startupPerfLogger?.point('applyFileDelta_remove_start');
    const removed: Array<[string, FileMetadata]> = [];
    for (const relativeFilePath of removedFiles) {
      const metadata = fileSystem.remove(relativeFilePath);
      if (metadata) {
        removed.push([relativeFilePath, metadata]);
      }
    }
    this.#startupPerfLogger?.point('applyFileDelta_remove_end');

    const readLinkPromises = [];
    const readLinkErrors: Array<{
      normalFilePath: string,
      error: Error & {code?: string},
    }> = [];
    const filesToProcess: Array<[string, FileMetadata]> = [];

    for (const [normalFilePath, fileData] of changedFiles) {
      // A crawler may preserve the H.VISITED flag to indicate that the file
      // contents are unchaged and it doesn't need visiting again.
      if (fileData[H.VISITED] === 1) {
        continue;
      }

      if (fileData[H.SYMLINK] === 0) {
        filesToProcess.push([normalFilePath, fileData]);
      } else {
        const maybeReadLink = this.#maybeReadLink(normalFilePath, fileData);
        if (maybeReadLink) {
          readLinkPromises.push(
            maybeReadLink.catch(error =>
              readLinkErrors.push({normalFilePath, error}),
            ),
          );
        }
      }
    }
    this.#startupPerfLogger?.point('applyFileDelta_preprocess_end');

    debug(
      'Found %d added/modified files and %d symlinks.',
      filesToProcess.length,
      readLinkPromises.length,
    );

    this.#startupPerfLogger?.point('applyFileDelta_process_start');
    const [batchResult] = await Promise.all([
      this.#fileProcessor.processBatch(filesToProcess, {
        computeSha1: this.#options.computeSha1,
        maybeReturnContent: false,
      }),
      Promise.all(readLinkPromises),
    ]);
    this.#startupPerfLogger?.point('applyFileDelta_process_end');

    // It's possible that a file could be deleted between being seen by the
    // crawler and our attempt to process it. For our purposes, this is
    // equivalent to the file being deleted before the crawl, being absent
    // from `changedFiles`, and (if we loaded from cache, and the file
    // existed previously) possibly being reported in `removedFiles`.
    //
    // Treat the file accordingly - don't add it to `FileSystem`, and remove
    // it if it already exists. We're not emitting events at this point in
    // startup, so there's nothing more to do.
    this.#startupPerfLogger?.point('applyFileDelta_missing_start');
    for (const {normalFilePath, error} of batchResult.errors.concat(
      readLinkErrors,
    )) {
      /* $FlowFixMe[incompatible-type] Error exposed after improved typing of
       * Array.{includes,indexOf,lastIndexOf} */
      if (['ENOENT', 'EACCESS'].includes(error.code)) {
        missingFiles.add(normalFilePath);
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
    this.#startupPerfLogger?.point('applyFileDelta_missing_end');

    this.#startupPerfLogger?.point('applyFileDelta_add_start');
    fileSystem.bulkAddOrModify(changedFiles);
    this.#startupPerfLogger?.point('applyFileDelta_add_end');

    this.#startupPerfLogger?.point('applyFileDelta_updatePlugins_start');

    await Promise.all([
      plugins.map(({plugin, dataIdx}) => {
        const mapFn: (
          [CanonicalPath, FileMetadata],
        ) => [CanonicalPath, unknown] =
          dataIdx != null
            ? ([relativePath, fileData]) => [relativePath, fileData[dataIdx]]
            : ([relativePath, fileData]) => [relativePath, null];
        return plugin.bulkUpdate({
          addedOrModified: mapIterator(changedFiles.entries(), mapFn),
          removed: mapIterator(removed.values(), mapFn),
        });
      }),
    ]);
    this.#startupPerfLogger?.point('applyFileDelta_updatePlugins_end');
    this.#startupPerfLogger?.point('applyFileDelta_end');
  }

  /**
   * 4. Serialize a snapshot of our raw data via the configured cache manager
   */
  async #takeSnapshotAndPersist(
    fileSystem: FileSystem,
    clocks: WatchmanClocks,
    plugins: ReadonlyArray<IndexedPlugin>,
    changed: FileData,
    removed: Set<CanonicalPath>,
  ) {
    this.#startupPerfLogger?.point('persist_start');
    await this.#cacheManager.write(
      () => ({
        clocks: new Map(clocks),
        fileSystemData: fileSystem.getSerializableSnapshot(),
        plugins: new Map(
          plugins.map(({plugin}) => [
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
          this.#console.warn('[metro-file-map] Cache write error\n:', error);
        },
      },
    );
    this.#startupPerfLogger?.point('persist_end');
  }

  /**
   * Watch mode
   */
  async #watch(
    fileSystem: MutableFileSystem,
    clocks: WatchmanClocks,
    plugins: ReadonlyArray<IndexedPlugin>,
  ): Promise<void> {
    this.#startupPerfLogger?.point('watch_start');
    if (!this.#options.watch) {
      this.#startupPerfLogger?.point('watch_end');
      return;
    }

    const hasWatchedExtension = (filePath: string) =>
      this.#options.extensions.some(ext => filePath.endsWith(ext));

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
      const hmrPerfLogger = this.#options.perfLoggerFactory?.('HMR', {
        key: this.#getNextChangeID(),
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
        eventsQueue,
        logger: hmrPerfLogger,
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
          (!this.#options.enableSymlinks && change.metadata?.type === 'l'))
      ) {
        return;
      }

      const absoluteFilePath = path.join(
        change.root,
        normalizePathSeparatorsToSystem(change.relativePath),
      );

      // Ignore files (including symlinks) whose path matches ignorePattern
      // (we don't ignore node_modules in watch mode)
      if (this.#options.ignorePattern.test(absoluteFilePath)) {
        return;
      }

      const relativeFilePath =
        this.#pathUtils.absoluteToNormal(absoluteFilePath);
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
                firstEnqueuedTimestamp:
                  performance.timeOrigin + performance.now(),
                firstEventTimestamp: onChangeStartTime,
              };
            } else {
              nextEmit.eventsQueue.push(event);
            }
            return null;
          };

          // If the file was added or modified,
          // parse it and update the file map.
          if (change.event === 'touch') {
            invariant(
              change.metadata.size != null,
              'since the file exists or changed, it should have known size',
            );
            const fileMetadata: FileMetadata = [
              change.metadata.modifiedTime,
              change.metadata.size,
              0,
              null,
              change.metadata.type === 'l' ? 1 : 0,
              null,
            ];

            try {
              if (change.metadata.type === 'l') {
                await this.#maybeReadLink(relativeFilePath, fileMetadata);
              } else {
                await this.#fileProcessor.processRegularFile(
                  relativeFilePath,
                  fileMetadata,
                  {
                    computeSha1: this.#options.computeSha1,
                    maybeReturnContent: false,
                  },
                );
              }
              fileSystem.addOrModify(relativeFilePath, fileMetadata);
              this.#updateClock(clocks, change.clock);
              plugins.forEach(({plugin, dataIdx}) =>
                dataIdx != null
                  ? plugin.onNewOrModifiedFile(
                      relativeFilePath,
                      fileMetadata[dataIdx],
                    )
                  : plugin.onNewOrModifiedFile(relativeFilePath),
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
            this.#updateClock(clocks, change.clock);
            plugins.forEach(({plugin, dataIdx}) =>
              dataIdx != null
                ? plugin.onRemovedFile(relativeFilePath, metadata[dataIdx])
                : plugin.onRemovedFile(relativeFilePath),
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
          this.#console.error(
            `metro-file-map: watch error:\n  ${error.stack}\n`,
          );
        });
    };

    this.#changeInterval = setInterval(emitChange, CHANGE_INTERVAL);

    invariant(
      this.#watcher != null,
      'Expected #watcher to have been initialised by build()',
    );
    await this.#watcher.watch(onChange);

    if (this.#options.healthCheck.enabled) {
      const performHealthCheck = () => {
        if (!this.#watcher) {
          return;
        }
        // $FlowFixMe[unused-promise]
        this.#watcher
          .checkHealth(this.#options.healthCheck.timeout)
          .then(result => {
            this.emit('healthCheck', result);
          });
      };
      performHealthCheck();
      this.#healthCheckInterval = setInterval(
        performHealthCheck,
        this.#options.healthCheck.interval,
      );
    }
    this.#startupPerfLogger?.point('watch_end');
  }

  async end(): Promise<void> {
    if (this.#changeInterval) {
      clearInterval(this.#changeInterval);
    }
    if (this.#healthCheckInterval) {
      clearInterval(this.#healthCheckInterval);
    }

    this.#crawlerAbortController.abort();

    await Promise.all([
      this.#fileProcessor.end(),
      this.#watcher?.close(),
      this.#cacheManager.end(),
    ]);
  }

  async #shouldUseWatchman(): Promise<boolean> {
    if (!this.#options.useWatchman) {
      return false;
    }
    if (!this.#canUseWatchmanPromise) {
      this.#canUseWatchmanPromise = checkWatchmanCapabilities(
        WATCHMAN_REQUIRED_CAPABILITIES,
      )
        .then(({version}) => {
          this.#startupPerfLogger?.annotate({
            string: {
              watchmanVersion: version,
            },
          });
          return true;
        })
        .catch(e => {
          // TODO: Advise people to either install Watchman or set
          // `useWatchman: false` here?
          this.#startupPerfLogger?.annotate({
            string: {
              watchmanFailedCapabilityCheck: e?.message ?? '[missing]',
            },
          });
          return false;
        });
    }
    return this.#canUseWatchmanPromise;
  }

  #getNextChangeID(): number {
    if (this.#changeID >= Number.MAX_SAFE_INTEGER) {
      this.#changeID = 0;
    }
    return ++this.#changeID;
  }

  #updateClock(clocks: WatchmanClocks, newClock?: ?ChangeEventClock): void {
    if (newClock == null) {
      return;
    }
    const [absoluteWatchRoot, clockSpec] = newClock;
    const relativeFsRoot = this.#pathUtils.absoluteToNormal(absoluteWatchRoot);
    clocks.set(normalizePathSeparatorsToPosix(relativeFsRoot), clockSpec);
  }

  static H: HType = H;
}

// TODO: Replace with it.map() from Node 22+
const mapIterator: <T, S>(Iterator<T>, (T) => S) => Iterable<S> = (it, fn) =>
  'map' in it
    ? it.map(fn)
    : (function* mapped() {
        for (const item of it) {
          yield fn(item);
        }
      })();
