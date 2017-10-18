/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const AssetServer = require('../AssetServer');
const Bundler = require('../Bundler');
const DeltaBundler = require('../DeltaBundler');
const MultipartResponse = require('./MultipartResponse');
const Serializers = require('../DeltaBundler/Serializers');
const debug = require('debug')('Metro:Server');
const defaults = require('../defaults');
const emptyFunction = require('fbjs/lib/emptyFunction');
const formatBundlingError = require('../lib/formatBundlingError');
const getMaxWorkers = require('../lib/getMaxWorkers');
const getOrderedDependencyPaths = require('../lib/getOrderedDependencyPaths');
const mime = require('mime-types');
const parsePlatformFilePath = require('../node-haste/lib/parsePlatformFilePath');
const path = require('path');
const symbolicate = require('./symbolicate');
const url = require('url');

import type {CustomError} from '../lib/formatBundlingError';
import type Module, {HasteImpl} from '../node-haste/Module';
import type {IncomingMessage, ServerResponse} from 'http';
import type ResolutionResponse from '../node-haste/DependencyGraph/ResolutionResponse';
import type {BundlingOptions} from '../Bundler';
import type Bundle from '../Bundler/Bundle';
import type HMRBundle from '../Bundler/HMRBundle';
import type {Reporter} from '../lib/reporting';
import type {Options as DeltaBundlerOptions} from '../DeltaBundler/Serializers';
import type {
  GetTransformOptions,
  PostProcessModules,
  PostMinifyProcess,
  PostProcessBundleSourcemap,
} from '../Bundler';
import type {TransformCache} from '../lib/TransformCaching';
import type {GlobalTransformCache} from '../lib/GlobalTransformCache';
import type {SourceMap, Symbolicate} from './symbolicate';

const {
  createActionStartEntry,
  createActionEndEntry,
  log,
} = require('../Logger');

function debounceAndBatch(fn, delay) {
  let args = [];
  let timeout;
  return value => {
    args.push(value);
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      const a = args;
      args = [];
      fn(a);
    }, delay);
  };
}

export type Options = {|
  assetExts?: Array<string>,
  +assetRegistryPath: string,
  blacklistRE?: RegExp,
  cacheVersion?: string,
  enableBabelRCLookup?: boolean,
  extraNodeModules?: {},
  getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  getTransformOptions?: GetTransformOptions,
  globalTransformCache: ?GlobalTransformCache,
  hasteImpl?: HasteImpl,
  maxWorkers?: number,
  moduleFormat?: string,
  platforms?: Array<string>,
  polyfillModuleNames?: Array<string>,
  postProcessModules?: PostProcessModules,
  postMinifyProcess: PostMinifyProcess,
  postProcessBundleSourcemap: PostProcessBundleSourcemap,
  projectRoots: $ReadOnlyArray<string>,
  providesModuleNodeModules?: Array<string>,
  reporter?: Reporter,
  resetCache?: boolean,
  +runBeforeMainModule: Array<string>,
  silent?: boolean,
  +sourceExts: ?Array<string>,
  +transformCache: TransformCache,
  transformModulePath?: string,
  useDeltaBundler: boolean,
  watch?: boolean,
  workerPath: ?string,
|};

export type BundleOptions = {
  +assetPlugins: Array<string>,
  dev: boolean,
  entryFile: string,
  +entryModuleOnly: boolean,
  +excludeSource: boolean,
  +generateSourceMaps: boolean,
  +hot: boolean,
  +inlineSourceMap: boolean,
  +isolateModuleIDs: boolean,
  minify: boolean,
  onProgress: ?(doneCont: number, totalCount: number) => mixed,
  +platform: ?string,
  +resolutionResponse: ?{},
  +runBeforeMainModule: Array<string>,
  +runModule: boolean,
  sourceMapUrl: ?string,
  unbundle: boolean,
};

type DependencyOptions = {|
  +dev: boolean,
  +entryFile: string,
  +hot: boolean,
  +minify: boolean,
  +platform: ?string,
  +recursive: boolean,
  +rootEntryFile: string,
  +bundlingOptions?: BundlingOptions,
|};

type BuildInfo = {|
  filesChangedCount: number,
|};

const FILES_CHANGED_COUNT_HEADER = 'X-Metro-Files-Changed-Count';
const FILES_CHANGED_COUNT_REBUILD = -1;

const bundleDeps = new WeakMap();
const NODE_MODULES = `${path.sep}node_modules${path.sep}`;

class Server {
  _opts: {
    assetExts: Array<string>,
    blacklistRE: void | RegExp,
    cacheVersion: string,
    enableBabelRCLookup: boolean,
    extraNodeModules: {},
    getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
    getTransformOptions?: GetTransformOptions,
    hasteImpl?: HasteImpl,
    maxWorkers: number,
    moduleFormat: string,
    platforms: Array<string>,
    polyfillModuleNames: Array<string>,
    postProcessModules?: PostProcessModules,
    postMinifyProcess: PostMinifyProcess,
    postProcessBundleSourcemap: PostProcessBundleSourcemap,
    projectRoots: $ReadOnlyArray<string>,
    providesModuleNodeModules?: Array<string>,
    reporter: Reporter,
    resetCache: boolean,
    +runBeforeMainModule: Array<string>,
    silent: boolean,
    +sourceExts: Array<string>,
    +transformCache: TransformCache,
    +transformModulePath: string,
    watch: boolean,
    workerPath: ?string,
  };
  _projectRoots: $ReadOnlyArray<string>;
  _bundles: {};
  _bundleBuildInfos: WeakMap<Bundle, BuildInfo>;
  _changeWatchers: Array<{
    req: IncomingMessage,
    res: ServerResponse,
  }>;
  _fileChangeListeners: Array<(filePath: string) => mixed>;
  _assetServer: AssetServer;
  _bundler: Bundler;
  _debouncedFileChangeHandler: (filePath: string) => mixed;
  _hmrFileChangeListener: ?(type: string, filePath: string) => mixed;
  _reporter: Reporter;
  _symbolicateInWorker: Symbolicate;
  _platforms: Set<string>;
  _nextBundleBuildID: number;
  _deltaBundler: DeltaBundler;

  constructor(options: Options) {
    const reporter =
      options.reporter || require('../lib/reporting').nullReporter;
    const maxWorkers = getMaxWorkers(options.maxWorkers);
    this._opts = {
      assetExts: options.assetExts || defaults.assetExts,
      assetRegistryPath: options.assetRegistryPath,
      blacklistRE: options.blacklistRE,
      cacheVersion: options.cacheVersion || '1.0',
      enableBabelRCLookup:
        options.enableBabelRCLookup != null
          ? options.enableBabelRCLookup
          : true,
      extraNodeModules: options.extraNodeModules || {},
      getPolyfills: options.getPolyfills,
      getTransformOptions: options.getTransformOptions,
      globalTransformCache: options.globalTransformCache,
      hasteImpl: options.hasteImpl,
      maxWorkers,
      moduleFormat:
        options.moduleFormat != null ? options.moduleFormat : 'haste',
      platforms: options.platforms || defaults.platforms,
      polyfillModuleNames: options.polyfillModuleNames || [],
      postProcessModules: options.postProcessModules,
      postMinifyProcess: options.postMinifyProcess,
      postProcessBundleSourcemap: options.postProcessBundleSourcemap,
      projectRoots: options.projectRoots,
      providesModuleNodeModules: options.providesModuleNodeModules,
      reporter,
      resetCache: options.resetCache || false,
      runBeforeMainModule: options.runBeforeMainModule,
      silent: options.silent || false,
      sourceExts: options.sourceExts || defaults.sourceExts,
      transformCache: options.transformCache,
      transformModulePath:
        options.transformModulePath || defaults.transformModulePath,
      useDeltaBundler: options.useDeltaBundler,
      watch: options.watch || false,
      workerPath: options.workerPath,
    };

    const processFileChange = ({type, filePath}) =>
      this.onFileChange(type, filePath);

    this._reporter = reporter;
    this._projectRoots = this._opts.projectRoots;
    /* $FlowFixMe(>=0.56.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.56 was deployed. To see the error delete this
     * comment and run Flow. */
    this._bundles = Object.create(null);
    this._bundleBuildInfos = new WeakMap();
    this._changeWatchers = [];
    this._fileChangeListeners = [];
    this._platforms = new Set(this._opts.platforms);

    this._assetServer = new AssetServer({
      assetExts: this._opts.assetExts,
      projectRoots: this._opts.projectRoots,
    });

    const bundlerOpts = Object.create(this._opts);
    bundlerOpts.assetServer = this._assetServer;
    bundlerOpts.allowBundleUpdates = this._opts.watch;
    bundlerOpts.globalTransformCache = options.globalTransformCache;
    bundlerOpts.watch = this._opts.watch;
    bundlerOpts.reporter = reporter;
    this._bundler = new Bundler(bundlerOpts);

    // changes to the haste map can affect resolution of files in the bundle
    this._bundler.getResolver().then(resolver => {
      resolver
        .getDependencyGraph()
        .getWatcher()
        .on('change', ({eventsQueue}) =>
          eventsQueue.forEach(processFileChange),
        );
    });

    this._debouncedFileChangeHandler = debounceAndBatch(filePaths => {
      // only clear bundles for non-JS changes
      if (filePaths.every(RegExp.prototype.test, /\.js(?:on)?$/i)) {
        for (const key in this._bundles) {
          this._bundles[key]
            .then(bundle => {
              const deps = bundleDeps.get(bundle);
              filePaths.forEach(filePath => {
                // $FlowFixMe(>=0.37.0)
                if (deps.files.has(filePath)) {
                  // $FlowFixMe(>=0.37.0)
                  deps.outdated.add(filePath);
                }
              });
            })
            .catch(e => {
              debug(`Could not update bundle: ${e}, evicting from cache`);
              delete this._bundles[key];
            });
        }
      } else {
        debug('Clearing bundles due to non-JS change');
        this._clearBundles();
      }
      this._informChangeWatchers();
    }, 50);

    this._symbolicateInWorker = symbolicate.createWorker();
    this._nextBundleBuildID = 1;

    this._deltaBundler = new DeltaBundler(this._bundler, {
      getPolyfills: this._opts.getPolyfills,
      polyfillModuleNames: this._opts.polyfillModuleNames,
    });
  }

  end() {
    this._deltaBundler.end();
    this._bundler.end();
  }

  setHMRFileChangeListener(
    listener: ?(type: string, filePath: string) => mixed,
  ) {
    this._hmrFileChangeListener = listener;
  }

  addFileChangeListener(listener: (filePath: string) => mixed) {
    if (this._fileChangeListeners.indexOf(listener) === -1) {
      this._fileChangeListeners.push(listener);
    }
  }

  getDeltaBundler(): DeltaBundler {
    return this._deltaBundler;
  }

  async buildBundle(options: BundleOptions): Promise<Bundle> {
    const bundle = await this._bundler.bundle({
      ...options,
      runBeforeMainModule: this._opts.runBeforeMainModule,
    });
    const modules = bundle.getModules();
    const nonVirtual = modules.filter(m => !m.virtual);
    bundleDeps.set(bundle, {
      files: new Map(
        nonVirtual.map(({sourcePath, meta}) => [
          sourcePath,
          meta != null ? meta.dependencies : [],
        ]),
      ),
      idToIndex: new Map(modules.map(({id}, i) => [id, i])),
      dependencyPairs: new Map(
        nonVirtual
          .filter(({meta}) => meta && meta.dependencyPairs)
          .map(m => [m.sourcePath, m.meta.dependencyPairs]),
      ),
      outdated: new Set(),
    });
    return bundle;
  }

  buildBundleFromUrl(reqUrl: string): Promise<Bundle> {
    const options = this._getOptionsFromUrl(reqUrl);
    return this.buildBundle(options);
  }

  buildBundleForHMR(
    options: {platform: ?string},
    host: string,
    port: number,
  ): Promise<HMRBundle> {
    return this._bundler.hmrBundle(options, host, port);
  }

  getShallowDependencies(options: DependencyOptions): Promise<Array<string>> {
    return Promise.resolve().then(() => {
      const platform =
        options.platform != null
          ? options.platform
          : parsePlatformFilePath(options.entryFile, this._platforms).platform;
      const {
        entryFile,
        dev,
        minify,
        hot,
        rootEntryFile,
        bundlingOptions,
      } = options;
      return this._bundler.getShallowDependencies({
        entryFile,
        rootEntryFile,
        platform,
        dev,
        minify,
        hot,
        generateSourceMaps: false,
        transformOptions: bundlingOptions && bundlingOptions.transformer,
      });
    });
  }

  getModuleForPath(entryFile: string): Promise<Module> {
    return this._bundler.getModuleForPath(entryFile);
  }

  getDependencies(
    options: DependencyOptions,
  ): Promise<ResolutionResponse<Module, *>> {
    return Promise.resolve().then(() => {
      const platform =
        options.platform != null
          ? options.platform
          : parsePlatformFilePath(options.entryFile, this._platforms).platform;
      const {entryFile, dev, minify, hot, rootEntryFile} = options;
      return this._bundler.getDependencies({
        entryFile,
        platform,
        dev,
        minify,
        hot,
        generateSourceMaps: false,
        rootEntryFile,
        prependPolyfills: true,
      });
    });
  }

  async getOrderedDependencyPaths(options: {
    +entryFile: string,
    +dev: boolean,
    +platform: string,
    +minify: boolean,
    +generateSourceMaps: boolean,
  }): Promise<Array<string>> {
    if (this._opts.useDeltaBundler) {
      const bundleOptions = {
        ...Server.DEFAULT_BUNDLE_OPTIONS,
        ...options,
        deltaBundleId: null,
      };

      if (!bundleOptions.platform) {
        bundleOptions.platform = parsePlatformFilePath(
          bundleOptions.entryFile,
          this._platforms,
        ).platform;
      }

      return await getOrderedDependencyPaths(
        this._deltaBundler,
        this._assetServer,
        this._projectRoots,
        bundleOptions,
      );
    }

    return this._bundler.getOrderedDependencyPaths(options);
  }

  onFileChange(type: string, filePath: string) {
    this._assetServer.onFileChange(type, filePath);

    // If Hot Loading is enabled avoid rebuilding bundles and sending live
    // updates. Instead, send the HMR updates right away and clear the bundles
    // cache so that if the user reloads we send them a fresh bundle
    const {_hmrFileChangeListener} = this;
    if (_hmrFileChangeListener) {
      // Clear cached bundles in case user reloads
      this._clearBundles();
      _hmrFileChangeListener(type, filePath);
      return;
    } else if (type !== 'change' && filePath.indexOf(NODE_MODULES) !== -1) {
      // node module resolution can be affected by added or removed files
      debug('Clearing bundles due to potential node_modules resolution change');
      this._clearBundles();
    }

    Promise.all(
      this._fileChangeListeners.map(listener => listener(filePath)),
    ).then(
      () => this._onFileChangeComplete(filePath),
      () => this._onFileChangeComplete(filePath),
    );
  }

  _onFileChangeComplete(filePath: string) {
    // Make sure the file watcher event runs through the system before
    // we rebuild the bundles.
    this._debouncedFileChangeHandler(filePath);
  }

  _clearBundles() {
    /* $FlowFixMe(>=0.56.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.56 was deployed. To see the error delete this
     * comment and run Flow. */
    this._bundles = Object.create(null);
  }

  _informChangeWatchers() {
    const watchers = this._changeWatchers;
    const headers = {
      'Content-Type': 'application/json; charset=UTF-8',
    };

    watchers.forEach(function(w) {
      w.res.writeHead(205, headers);
      w.res.end(JSON.stringify({changed: true}));
    });

    this._changeWatchers = [];
  }

  _processdebugRequest(reqUrl: string, res: ServerResponse) {
    let ret = '<!doctype html>';
    const pathname = url.parse(reqUrl).pathname;
    /* $FlowFixMe: pathname would be null for an invalid URL */
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 1) {
      ret += '<div><a href="/debug/bundles">Cached Bundles</a></div>';
      res.end(ret);
    } else if (parts[1] === 'bundles') {
      ret += '<h1> Cached Bundles </h1>';
      Promise.all(
        Object.keys(this._bundles).map(optionsJson =>
          this._bundles[optionsJson].then(p => {
            ret += '<div><h2>' + optionsJson + '</h2>';
            ret += p.getDebugInfo();
          }),
        ),
      ).then(
        () => res.end(ret),
        e => {
          res.writeHead(500);
          res.end('Internal Error');
          // FIXME: $FlowFixMe: that's a hack, doesn't work with JSON-mode output
          this._reporter.terminal && this._reporter.terminal.log(e.stack);
        },
      );
    } else {
      res.writeHead(404);
      res.end('Invalid debug request');
      return;
    }
  }

  _processOnChangeRequest(req: IncomingMessage, res: ServerResponse) {
    const watchers = this._changeWatchers;

    watchers.push({
      req,
      res,
    });

    req.on('close', () => {
      for (let i = 0; i < watchers.length; i++) {
        if (watchers[i] && watchers[i].req === req) {
          watchers.splice(i, 1);
          break;
        }
      }
    });
  }

  _rangeRequestMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    data: string | Buffer,
    assetPath: string,
  ) {
    if (req.headers && req.headers.range) {
      const [rangeStart, rangeEnd] = req.headers.range
        .replace(/bytes=/, '')
        .split('-');
      const dataStart = parseInt(rangeStart, 10);
      const dataEnd = rangeEnd ? parseInt(rangeEnd, 10) : data.length - 1;
      const chunksize = dataEnd - dataStart + 1;

      res.writeHead(206, {
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize.toString(),
        'Content-Range': `bytes ${dataStart}-${dataEnd}/${data.length}`,
        'Content-Type': mime.lookup(path.basename(assetPath[1])),
      });

      return data.slice(dataStart, dataEnd + 1);
    }

    return data;
  }

  _processAssetsRequest(req: IncomingMessage, res: ServerResponse) {
    const urlObj = url.parse(decodeURI(req.url), true);
    /* $FlowFixMe: could be empty if the url is invalid */
    const assetPath: string = urlObj.pathname.match(/^\/assets\/(.+)$/);

    const processingAssetRequestLogEntry = log(
      createActionStartEntry({
        action_name: 'Processing asset request',
        asset: assetPath[1],
      }),
    );

    /* $FlowFixMe: query may be empty for invalid URLs */
    this._assetServer.get(assetPath[1], urlObj.query.platform).then(
      data => {
        // Tell clients to cache this for 1 year.
        // This is safe as the asset url contains a hash of the asset.
        if (process.env.REACT_NATIVE_ENABLE_ASSET_CACHING === true) {
          res.setHeader('Cache-Control', 'max-age=31536000');
        }
        res.end(this._rangeRequestMiddleware(req, res, data, assetPath));
        process.nextTick(() => {
          log(createActionEndEntry(processingAssetRequestLogEntry));
        });
      },
      error => {
        console.error(error.stack);
        res.writeHead(404);
        res.end('Asset not found');
      },
    );
  }

  optionsHash(options: {}) {
    // onProgress is a function, can't be serialized
    return JSON.stringify(Object.assign({}, options, {onProgress: null}));
  }

  /**
   * Ensure we properly report the promise of a build that's happening,
   * including failed builds. We use that separately for when we update a bundle
   * and for when we build for scratch.
   */
  _reportBundlePromise(
    buildID: string,
    options: BundleOptions,
    bundlePromise: Promise<Bundle>,
  ): Promise<Bundle> {
    this._reporter.update({
      buildID,
      bundleOptions: options,
      type: 'bundle_build_started',
    });
    return bundlePromise.then(
      bundle => {
        this._reporter.update({
          buildID,
          type: 'bundle_build_done',
        });
        return bundle;
      },
      error => {
        this._reporter.update({
          buildID,
          type: 'bundle_build_failed',
        });
        return Promise.reject(error);
      },
    );
  }

  useCachedOrUpdateOrCreateBundle(
    buildID: string,
    options: BundleOptions,
  ): Promise<Bundle> {
    const optionsJson = this.optionsHash(options);
    const bundleFromScratch = () => {
      const building = this.buildBundle(options);
      this._bundles[optionsJson] = building;
      return building.then(bundle => {
        this._bundleBuildInfos.set(bundle, {
          filesChangedCount: FILES_CHANGED_COUNT_REBUILD,
        });
        return bundle;
      });
    };

    if (optionsJson in this._bundles) {
      return this._bundles[optionsJson].then(bundle => {
        const deps = bundleDeps.get(bundle);
        // $FlowFixMe(>=0.37.0)
        const {dependencyPairs, files, idToIndex, outdated} = deps;
        if (outdated.size) {
          const updatingExistingBundleLogEntry = log(
            createActionStartEntry({
              action_name: 'Updating existing bundle',
              outdated_modules: outdated.size,
            }),
          );

          debug('Attempt to update existing bundle');

          // $FlowFixMe(>=0.37.0)
          deps.outdated = new Set();

          const {platform, dev, minify, hot} = options;

          // Need to create a resolution response to pass to the bundler
          // to process requires after transform. By providing a
          // specific response we can compute a non recursive one which
          // is the least we need and improve performance.
          const bundlePromise = (this._bundles[optionsJson] = Promise.all([
            this.getDependencies({
              platform,
              dev,
              hot,
              minify,
              entryFile: options.entryFile,
              rootEntryFile: options.entryFile,
              recursive: false,
            }),
            Promise.all(Array.from(outdated, this.getModuleForPath, this)),
          ])
            .then(([response, changedModules]: [$FlowFixMe, *]) => {
              debug('Update bundle: rebuild shallow bundle');

              changedModules.forEach(m => {
                response.setResolvedDependencyPairs(
                  m,
                  dependencyPairs.get(m.path),
                  {ignoreFinalized: true},
                );
              });

              return this.buildBundle({
                ...options,
                resolutionResponse: response.copy({
                  dependencies: changedModules,
                }),
              }).then(updateBundle => {
                const oldModules = bundle.getModules();
                const newModules = updateBundle.getModules();
                for (let i = 0, n = newModules.length; i < n; i++) {
                  const moduleTransport = newModules[i];
                  const {meta, sourcePath} = moduleTransport;
                  if (outdated.has(sourcePath)) {
                    if (
                      !contentsEqual(
                        meta.dependencies,
                        new Set(files.get(sourcePath)),
                      )
                    ) {
                      // bail out if any dependencies changed
                      return Promise.reject(
                        Error(
                          `Dependencies of ${sourcePath} changed from [${/* $FlowFixMe: `get` can return empty */
                          files
                            .get(sourcePath)
                            .join(', ')}] to [${meta.dependencies.join(', ')}]`,
                        ),
                      );
                    }

                    oldModules[
                      idToIndex.get(moduleTransport.id)
                    ] = moduleTransport;
                  }
                }

                bundle.invalidateSource();

                log(createActionEndEntry(updatingExistingBundleLogEntry));

                this._bundleBuildInfos.set(bundle, {
                  filesChangedCount: outdated.size,
                });

                debug('Successfully updated existing bundle');
                return bundle;
              });
            })
            .catch(e => {
              debug(
                'Failed to update existing bundle, rebuilding...',
                e.stack || e.message,
              );
              return bundleFromScratch();
            }));
          return this._reportBundlePromise(buildID, options, bundlePromise);
        } else {
          this._bundleBuildInfos.set(bundle, {
            filesChangedCount: 0,
          });

          debug('Using cached bundle');
          return bundle;
        }
      });
    }

    return this._reportBundlePromise(buildID, options, bundleFromScratch());
  }

  async processRequest(
    req: IncomingMessage,
    res: ServerResponse,
    next?: () => mixed,
  ) {
    const urlObj = url.parse(req.url, true);
    const {host} = req.headers;
    debug(`Handling request: ${host ? 'http://' + host : ''}${req.url}`);
    /* $FlowFixMe: Could be empty if the URL is invalid. */
    const pathname: string = urlObj.pathname;

    let requestType;
    if (pathname.match(/\.bundle$/)) {
      requestType = 'bundle';
    } else if (pathname.match(/\.map$/)) {
      requestType = 'map';
    } else if (pathname.match(/\.assets$/)) {
      requestType = 'assets';
    } else if (pathname.match(/\.delta$/)) {
      this._processDeltaRequest(req, res);
      return;
    } else if (pathname.match(/^\/debug/)) {
      this._processdebugRequest(req.url, res);
      return;
    } else if (pathname.match(/^\/onchange\/?$/)) {
      this._processOnChangeRequest(req, res);
      return;
    } else if (pathname.match(/^\/assets\//)) {
      this._processAssetsRequest(req, res);
      return;
    } else if (pathname === '/symbolicate') {
      this._symbolicate(req, res);
      return;
    } else if (next) {
      next();
      return;
    } else {
      res.writeHead(404);
      res.end();
      return;
    }

    if (this._opts.useDeltaBundler) {
      if (requestType === 'bundle') {
        await this._processBundleUsingDeltaBundler(req, res);
        return;
      } else if (requestType === 'map') {
        await this._processSourceMapUsingDeltaBundler(req, res);
        return;
      }
    }

    const options = this._getOptionsFromUrl(req.url);
    const requestingBundleLogEntry = log(
      createActionStartEntry({
        action_name: 'Requesting bundle',
        bundle_url: req.url,
        entry_point: options.entryFile,
      }),
    );

    const buildID = this.getNewBuildID();
    let reportProgress = emptyFunction;
    if (!this._opts.silent) {
      reportProgress = (transformedFileCount, totalFileCount) => {
        this._reporter.update({
          buildID,
          type: 'bundle_transform_progressed',
          transformedFileCount,
          totalFileCount,
        });
      };
    }

    const mres = MultipartResponse.wrap(req, res);
    options.onProgress = (done, total) => {
      reportProgress(done, total);
      mres.writeChunk(
        {'Content-Type': 'application/json'},
        JSON.stringify({done, total}),
      );
    };

    debug('Getting bundle for request');
    const building = this.useCachedOrUpdateOrCreateBundle(buildID, options);
    building
      .then(
        p => {
          if (requestType === 'bundle') {
            debug('Generating source code');
            const bundleSource = p.getSource({
              inlineSourceMap: options.inlineSourceMap,
              minify: options.minify,
              dev: options.dev,
            });
            debug('Writing response headers');
            const etag = p.getEtag();
            mres.setHeader('Content-Type', 'application/javascript');
            mres.setHeader('ETag', etag);

            if (req.headers['if-none-match'] === etag) {
              debug('Responding with 304');
              mres.writeHead(304);
              mres.end();
            } else {
              setBuildInfoHeaders(mres, this._bundleBuildInfos.get(p));
              mres.setHeader('Content-Length', Buffer.byteLength(bundleSource));
              mres.end(bundleSource);
            }
            debug('Finished response');
            log(createActionEndEntry(requestingBundleLogEntry));
          } else if (requestType === 'map') {
            const sourceMap = p.getSourceMapString({
              excludeSource: options.excludeSource,
              minify: options.minify,
              dev: options.dev,
            });

            mres.setHeader('Content-Type', 'application/json');
            mres.end(sourceMap);
            log(createActionEndEntry(requestingBundleLogEntry));
          } else if (requestType === 'assets') {
            const assetsList = JSON.stringify(p.getAssets());
            mres.setHeader('Content-Type', 'application/json');
            mres.end(assetsList);
            log(createActionEndEntry(requestingBundleLogEntry));
          }
        },
        error => this._handleError(mres, this.optionsHash(options), error),
      )
      .catch(error => {
        process.nextTick(() => {
          throw error;
        });
      });
  }

  _prepareDeltaBundler(
    req: IncomingMessage,
    mres: MultipartResponse,
  ): {options: DeltaBundlerOptions, buildID: string} {
    const options = this._getOptionsFromUrl(
      url.format({
        ...url.parse(req.url),
        protocol: 'http',
        host: req.headers.host,
      }),
    );

    const buildID = this.getNewBuildID();

    if (!this._opts.silent) {
      options.onProgress = (transformedFileCount, totalFileCount) => {
        mres.writeChunk(
          {'Content-Type': 'application/json'},
          JSON.stringify({done: transformedFileCount, total: totalFileCount}),
        );

        this._reporter.update({
          buildID,
          type: 'bundle_transform_progressed',
          transformedFileCount,
          totalFileCount,
        });
      };
    }

    this._reporter.update({
      buildID,
      bundleOptions: options,
      type: 'bundle_build_started',
    });

    return {options, buildID};
  }

  async _processDeltaRequest(req: IncomingMessage, res: ServerResponse) {
    const mres = MultipartResponse.wrap(req, res);
    const {options, buildID} = this._prepareDeltaBundler(req, mres);

    const requestingBundleLogEntry = log(
      createActionStartEntry({
        action_name: 'Requesting delta',
        bundle_url: req.url,
        entry_point: options.entryFile,
      }),
    );

    let output;

    try {
      output = await Serializers.deltaBundle(this._deltaBundler, {
        ...options,
        deltaBundleId: options.deltaBundleId,
      });
    } catch (error) {
      this._handleError(res, this.optionsHash(options), error);

      this._reporter.update({
        buildID,
        type: 'bundle_build_failed',
      });

      return;
    }

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Content-Length', String(Buffer.byteLength(output.bundle)));
    res.end(output.bundle);

    this._reporter.update({
      buildID,
      type: 'bundle_build_done',
    });

    debug('Finished response');
    log({
      ...createActionEndEntry(requestingBundleLogEntry),
      outdated_modules: output.numModifiedFiles,
    });
  }

  async _processBundleUsingDeltaBundler(
    req: IncomingMessage,
    res: ServerResponse,
  ) {
    const mres = MultipartResponse.wrap(req, res);
    const {options, buildID} = this._prepareDeltaBundler(req, mres);

    const requestingBundleLogEntry = log(
      createActionStartEntry({
        action_name: 'Requesting bundle',
        bundle_url: req.url,
        entry_point: options.entryFile,
        bundler: 'delta',
      }),
    );

    let result;

    try {
      result = await Serializers.fullBundle(this._deltaBundler, {
        ...options,
        deltaBundleId: this.optionsHash(options),
      });
    } catch (error) {
      this._handleError(mres, this.optionsHash(options), error);

      this._reporter.update({
        buildID,
        type: 'bundle_build_failed',
      });

      return;
    }

    if (
      // We avoid parsing the dates since the client should never send a more
      // recent date than the one returned by the Delta Bundler (if that's the
      // case it's fine to return the whole bundle).
      req.headers['if-modified-since'] === result.lastModified.toUTCString()
    ) {
      debug('Responding with 304');
      mres.writeHead(304);
      mres.end();
    } else {
      mres.setHeader(
        FILES_CHANGED_COUNT_HEADER,
        String(result.numModifiedFiles),
      );
      mres.setHeader('Content-Type', 'application/javascript');
      mres.setHeader('Last-Modified', result.lastModified.toUTCString());
      mres.setHeader(
        'Content-Length',
        String(Buffer.byteLength(result.bundle)),
      );
      mres.end(result.bundle);
    }

    this._reporter.update({
      buildID,
      type: 'bundle_build_done',
    });

    debug('Finished response');
    log({
      ...createActionEndEntry(requestingBundleLogEntry),
      outdated_modules: result.numModifiedFiles,
      bundler: 'delta',
    });
  }

  async _processSourceMapUsingDeltaBundler(
    req: IncomingMessage,
    res: ServerResponse,
  ) {
    const mres = MultipartResponse.wrap(req, res);
    const {options, buildID} = this._prepareDeltaBundler(req, mres);

    const requestingBundleLogEntry = log(
      createActionStartEntry({
        action_name: 'Requesting sourcemap',
        bundle_url: req.url,
        entry_point: options.entryFile,
        bundler: 'delta',
      }),
    );

    let sourceMap;

    try {
      sourceMap = await Serializers.fullSourceMap(this._deltaBundler, {
        ...options,
        deltaBundleId: this.optionsHash(options),
      });
    } catch (error) {
      this._handleError(mres, this.optionsHash(options), error);

      this._reporter.update({
        buildID,
        type: 'bundle_build_failed',
      });

      return;
    }

    mres.setHeader('Content-Type', 'application/json');
    mres.end(sourceMap.toString());

    this._reporter.update({
      buildID,
      type: 'bundle_build_done',
    });

    log(
      createActionEndEntry({
        ...requestingBundleLogEntry,
        bundler: 'delta',
      }),
    );
  }

  _symbolicate(req: IncomingMessage, res: ServerResponse) {
    const symbolicatingLogEntry = log(createActionStartEntry('Symbolicating'));

    debug('Start symbolication');

    /* $FlowFixMe: where is `rowBody` defined? Is it added by
     * the `connect` framework? */
    Promise.resolve(req.rawBody)
      .then(body => {
        const stack = JSON.parse(body).stack;

        // In case of multiple bundles / HMR, some stack frames can have
        // different URLs from others
        const urls = new Set();
        stack.forEach(frame => {
          const sourceUrl = frame.file;
          // Skip `/debuggerWorker.js` which drives remote debugging because it
          // does not need to symbolication.
          // Skip anything except http(s), because there is no support for that yet
          if (
            !urls.has(sourceUrl) &&
            !sourceUrl.endsWith('/debuggerWorker.js') &&
            sourceUrl.startsWith('http')
          ) {
            urls.add(sourceUrl);
          }
        });

        const mapPromises = Array.from(urls.values()).map(
          this._sourceMapForURL,
          this,
        );

        debug('Getting source maps for symbolication');
        return Promise.all(mapPromises).then(maps => {
          debug('Sending stacks and maps to symbolication worker');
          const urlsToMaps = zip(urls.values(), maps);
          return this._symbolicateInWorker(stack, urlsToMaps);
        });
      })
      .then(
        stack => {
          debug('Symbolication done');
          res.end(JSON.stringify({stack}));
          process.nextTick(() => {
            log(createActionEndEntry(symbolicatingLogEntry));
          });
        },
        error => {
          console.error(error.stack || error);
          res.statusCode = 500;
          res.end(JSON.stringify({error: error.message}));
        },
      );
  }

  async _sourceMapForURL(reqUrl: string): Promise<SourceMap> {
    const options: DeltaBundlerOptions = this._getOptionsFromUrl(reqUrl);

    if (this._opts.useDeltaBundler) {
      return await Serializers.fullSourceMapObject(this._deltaBundler, {
        ...options,
        deltaBundleId: this.optionsHash(options),
      });
    }

    // We're not properly reporting progress here. Reporting should be done
    // from within that function.
    const building = this.useCachedOrUpdateOrCreateBundle(
      this.getNewBuildID(),
      options,
    );
    return building.then(p =>
      p.getSourceMap({
        excludeSource: options.excludeSource,
        minify: options.minify,
        dev: options.dev,
      }),
    );
  }

  _handleError(res: ServerResponse, bundleID: string, error: CustomError) {
    res.writeHead(error.status || 500, {
      'Content-Type': 'application/json; charset=UTF-8',
    });

    const formattedError = formatBundlingError(error);

    res.end(JSON.stringify(formattedError));

    if (error instanceof Error && error.type === 'NotFoundError') {
      delete this._bundles[bundleID];
    }

    this._reporter.update({error, type: 'bundling_error'});
  }

  _getOptionsFromUrl(reqUrl: string): BundleOptions & DeltaBundlerOptions {
    // `true` to parse the query param as an object.
    const urlObj = url.parse(reqUrl, true);

    /* $FlowFixMe: `pathname` could be empty for an invalid URL */
    const pathname = decodeURIComponent(urlObj.pathname);

    // Backwards compatibility. Options used to be as added as '.' to the
    // entry module name. We can safely remove these options.
    const entryFile =
      pathname
        .replace(/^\//, '')
        .split('.')
        .filter(part => {
          if (
            part === 'includeRequire' ||
            part === 'runModule' ||
            part === 'bundle' ||
            part === 'map' ||
            part === 'delta' ||
            part === 'assets'
          ) {
            return false;
          }
          return true;
        })
        .join('.') + '.js';

    // try to get the platform from the url
    const platform =
      /* $FlowFixMe: `query` could be empty for an invalid URL */
      urlObj.query.platform ||
      parsePlatformFilePath(pathname, this._platforms).platform;

    /* $FlowFixMe: `query` could be empty for an invalid URL */
    const deltaBundleId = urlObj.query.deltaBundleId;

    /* $FlowFixMe: `query` could be empty for an invalid URL */
    const assetPlugin = urlObj.query.assetPlugin;
    const assetPlugins = Array.isArray(assetPlugin)
      ? assetPlugin
      : typeof assetPlugin === 'string' ? [assetPlugin] : [];

    const dev = this._getBoolOptionFromQuery(urlObj.query, 'dev', true);
    const minify = this._getBoolOptionFromQuery(urlObj.query, 'minify', false);
    const excludeSource = this._getBoolOptionFromQuery(
      urlObj.query,
      'excludeSource',
      false,
    );

    return {
      sourceMapUrl: url.format({
        ...urlObj,
        pathname: pathname.replace(/\.(bundle|delta)$/, '.map'),
      }),
      entryFile,
      deltaBundleId,
      dev,
      minify,
      excludeSource,
      hot: true,
      runBeforeMainModule: this._opts.runBeforeMainModule,
      runModule: this._getBoolOptionFromQuery(urlObj.query, 'runModule', true),
      inlineSourceMap: this._getBoolOptionFromQuery(
        urlObj.query,
        'inlineSourceMap',
        false,
      ),
      isolateModuleIDs: false,
      platform,
      resolutionResponse: null,
      entryModuleOnly: this._getBoolOptionFromQuery(
        urlObj.query,
        'entryModuleOnly',
        false,
      ),
      generateSourceMaps: false,
      assetPlugins,
      onProgress: null,
      unbundle: false,
    };
  }

  _getBoolOptionFromQuery(
    query: ?{},
    opt: string,
    defaultVal: boolean,
  ): boolean {
    /* $FlowFixMe: `query` could be empty when it comes from an invalid URL */
    if (query[opt] == null) {
      return defaultVal;
    }

    return query[opt] === 'true' || query[opt] === '1';
  }

  getNewBuildID(): string {
    return (this._nextBundleBuildID++).toString(36);
  }

  static DEFAULT_BUNDLE_OPTIONS;
}

Server.DEFAULT_BUNDLE_OPTIONS = {
  assetPlugins: [],
  dev: true,
  entryModuleOnly: false,
  excludeSource: false,
  generateSourceMaps: false,
  hot: false,
  inlineSourceMap: false,
  isolateModuleIDs: false,
  minify: false,
  onProgress: null,
  resolutionResponse: null,
  runBeforeMainModule: [],
  runModule: true,
  sourceMapUrl: null,
  unbundle: false,
};

function contentsEqual<T>(array: Array<T>, set: Set<T>): boolean {
  return array.length === set.size && array.every(set.has, set);
}

function* zip<X, Y>(xs: Iterable<X>, ys: Iterable<Y>): Iterable<[X, Y]> {
  //$FlowIssue #9324959
  const ysIter: Iterator<Y> = ys[Symbol.iterator]();
  for (const x of xs) {
    const y = ysIter.next();
    if (y.done) {
      return;
    }
    yield [x, y.value];
  }
}

function setBuildInfoHeaders(
  resp: MultipartResponse,
  buildInfo: ?BuildInfo,
): void {
  if (buildInfo) {
    resp.setHeader(FILES_CHANGED_COUNT_HEADER, buildInfo.filesChangedCount);
  }
}

module.exports = Server;
