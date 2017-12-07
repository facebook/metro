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

const Bundler = require('../Bundler');
const DeltaBundler = require('../DeltaBundler');
const MultipartResponse = require('./MultipartResponse');
const Serializers = require('../DeltaBundler/Serializers');
const debug = require('debug')('Metro:Server');
const defaults = require('../defaults');
const formatBundlingError = require('../lib/formatBundlingError');
const getMaxWorkers = require('../lib/getMaxWorkers');
const getOrderedDependencyPaths = require('../lib/getOrderedDependencyPaths');
const mime = require('mime-types');
const parsePlatformFilePath = require('../node-haste/lib/parsePlatformFilePath');
const path = require('path');
const symbolicate = require('./symbolicate');
const url = require('url');

const {getAsset} = require('../Assets');

import type {CustomError} from '../lib/formatBundlingError';
import type {HasteImpl} from '../node-haste/Module';
import type {IncomingMessage, ServerResponse} from 'http';
import type {Reporter} from '../lib/reporting';
import type {Options as DeltaBundlerOptions} from '../DeltaBundler/Serializers';
import type {BundleOptions, Options} from '../shared/types.flow';
import type {
  GetTransformOptions,
  PostMinifyProcess,
  PostProcessBundleSourcemap,
} from '../Bundler';
import type {TransformCache} from '../lib/TransformCaching';
import type {SourceMap, Symbolicate} from './symbolicate';
import type {AssetData} from '../Assets';
import type {RamBundleInfo} from '../DeltaBundler/Serializers';
import type {PostProcessModules} from '../DeltaBundler';
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

const FILES_CHANGED_COUNT_HEADER = 'X-Metro-Files-Changed-Count';

class Server {
  _opts: {
    assetExts: Array<string>,
    blacklistRE: void | RegExp,
    cacheVersion: string,
    createModuleIdFactory?: () => (path: string) => number,
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
    +getModulesRunBeforeMainModule: (entryFilePath: string) => Array<string>,
    silent: boolean,
    +sourceExts: Array<string>,
    +transformCache: TransformCache,
    +transformModulePath: string,
    watch: boolean,
    workerPath: ?string,
  };
  _changeWatchers: Array<{
    req: IncomingMessage,
    res: ServerResponse,
  }>;
  _fileChangeListeners: Array<(filePath: string) => mixed>;
  _bundler: Bundler;
  _debouncedFileChangeHandler: (filePath: string) => mixed;
  _reporter: Reporter;
  _symbolicateInWorker: Symbolicate;
  _platforms: Set<string>;
  _nextBundleBuildID: number;
  _deltaBundler: DeltaBundler;

  constructor(options: Options) {
    const reporter =
      options.reporter || require('../lib/reporting').nullReporter;
    const maxWorkers = getMaxWorkers(options.maxWorkers);
    const assetExts = options.assetExts || defaults.assetExts;
    const sourceExts = options.sourceExts || defaults.sourceExts;

    this._opts = {
      assetExts: options.assetTransforms ? [] : assetExts,
      assetRegistryPath: options.assetRegistryPath,
      blacklistRE: options.blacklistRE,
      cacheVersion: options.cacheVersion || '1.0',
      createModuleIdFactory: options.createModuleIdFactory,
      enableBabelRCLookup:
        options.enableBabelRCLookup != null
          ? options.enableBabelRCLookup
          : true,
      extraNodeModules: options.extraNodeModules || {},
      getModulesRunBeforeMainModule: options.getModulesRunBeforeMainModule,
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
      silent: options.silent || false,
      sourceExts: options.assetTransforms
        ? sourceExts.concat(assetExts)
        : sourceExts,
      transformCache: options.transformCache,
      transformModulePath:
        options.transformModulePath || defaults.transformModulePath,
      watch: options.watch || false,
      workerPath: options.workerPath,
    };

    const processFileChange = ({type, filePath}) =>
      this.onFileChange(type, filePath);

    this._reporter = reporter;
    this._changeWatchers = [];
    this._fileChangeListeners = [];
    this._platforms = new Set(this._opts.platforms);

    const bundlerOpts = Object.create(this._opts);
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
      this._informChangeWatchers();
    }, 50);

    this._symbolicateInWorker = symbolicate.createWorker();
    this._nextBundleBuildID = 1;

    this._deltaBundler = new DeltaBundler(this._bundler, {
      getPolyfills: this._opts.getPolyfills,
      polyfillModuleNames: this._opts.polyfillModuleNames,
      postProcessModules: this._opts.postProcessModules,
    });
  }

  end() {
    this._deltaBundler.end();
    this._bundler.end();
  }

  addFileChangeListener(listener: (filePath: string) => mixed) {
    if (this._fileChangeListeners.indexOf(listener) === -1) {
      this._fileChangeListeners.push(listener);
    }
  }

  getDeltaBundler(): DeltaBundler {
    return this._deltaBundler;
  }

  async build(options: BundleOptions): Promise<{code: string, map: string}> {
    options = {
      ...options,
      deltaBundleId: null,
    };

    const fullBundle = await Serializers.fullBundle(
      this._deltaBundler,
      options,
    );

    const fullMap = await Serializers.fullSourceMap(
      this._deltaBundler,
      options,
    );

    return {
      code: fullBundle.bundle,
      map: fullMap,
    };
  }

  async getRamBundleInfo(options: BundleOptions): Promise<RamBundleInfo> {
    options = {...options, deltaBundleId: null};

    return await Serializers.getRamBundleInfo(this._deltaBundler, options);
  }

  async getAssets(options: BundleOptions): Promise<$ReadOnlyArray<AssetData>> {
    return await Serializers.getAssets(this._deltaBundler, {
      ...options,
      deltaBundleId: null,
    });
  }

  async getOrderedDependencyPaths(options: {
    +entryFile: string,
    +dev: boolean,
    +platform: string,
    +minify: boolean,
    +generateSourceMaps: boolean,
  }): Promise<Array<string>> {
    const bundleOptions = {
      ...Server.DEFAULT_BUNDLE_OPTIONS,
      ...options,
      bundleType: 'delta',
      deltaBundleId: null,
    };

    if (!bundleOptions.platform) {
      bundleOptions.platform = parsePlatformFilePath(
        bundleOptions.entryFile,
        this._platforms,
      ).platform;
    }

    return await getOrderedDependencyPaths(this._deltaBundler, bundleOptions);
  }

  onFileChange(type: string, filePath: string) {
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

  async _processSingleAssetRequest(req: IncomingMessage, res: ServerResponse) {
    const urlObj = url.parse(decodeURI(req.url), true);
    /* $FlowFixMe: could be empty if the url is invalid */
    const assetPath: string = urlObj.pathname.match(/^\/assets\/(.+)$/);

    const processingAssetRequestLogEntry = log(
      createActionStartEntry({
        action_name: 'Processing asset request',
        asset: assetPath[1],
      }),
    );

    try {
      const data = await getAsset(
        assetPath[1],
        this._opts.projectRoots,
        /* $FlowFixMe: query may be empty for invalid URLs */
        urlObj.query.platform,
      );
      // Tell clients to cache this for 1 year.
      // This is safe as the asset url contains a hash of the asset.
      if (process.env.REACT_NATIVE_ENABLE_ASSET_CACHING === true) {
        res.setHeader('Cache-Control', 'max-age=31536000');
      }
      res.end(this._rangeRequestMiddleware(req, res, data, assetPath));
      process.nextTick(() => {
        log(createActionEndEntry(processingAssetRequestLogEntry));
      });
    } catch (error) {
      console.error(error.stack);
      res.writeHead(404);
      res.end('Asset not found');
    }
  }

  _optionsHash(options: {}) {
    // List of option parameters that won't affect the build result, so they
    // can be ignored to calculate the options hash.
    const ignoredParams = {
      onProgress: null,
      excludeSource: null,
      sourceMapUrl: null,
    };

    return JSON.stringify(Object.assign({}, options, ignoredParams));
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

    if (pathname.match(/\.bundle$/)) {
      await this._processBundleRequest(req, res);
    } else if (pathname.match(/\.map$/)) {
      await this._processSourceMapRequest(req, res);
    } else if (pathname.match(/\.assets$/)) {
      await this._processAssetsRequest(req, res);
    } else if (pathname.match(/\.delta$/)) {
      await this._processDeltaRequest(req, res);
    } else if (pathname.match(/^\/onchange\/?$/)) {
      this._processOnChangeRequest(req, res);
    } else if (pathname.match(/^\/assets\//)) {
      await this._processSingleAssetRequest(req, res);
    } else if (pathname === '/symbolicate') {
      this._symbolicate(req, res);
    } else if (next) {
      next();
    } else {
      res.writeHead(404);
      res.end();
    }
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
      this._handleError(mres, this._optionsHash(options), error);

      this._reporter.update({
        buildID,
        type: 'bundle_build_failed',
      });

      return;
    }

    mres.setHeader(FILES_CHANGED_COUNT_HEADER, String(output.numModifiedFiles));
    mres.setHeader('Content-Type', 'application/javascript');
    mres.setHeader('Content-Length', String(Buffer.byteLength(output.bundle)));
    mres.end(output.bundle);

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

  async _processBundleRequest(req: IncomingMessage, res: ServerResponse) {
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
        deltaBundleId: this._optionsHash(options),
      });
    } catch (error) {
      this._handleError(mres, this._optionsHash(options), error);

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

  async _processSourceMapRequest(req: IncomingMessage, res: ServerResponse) {
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
        deltaBundleId: this._optionsHash(options),
      });
    } catch (error) {
      this._handleError(mres, this._optionsHash(options), error);

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

  async _processAssetsRequest(req: IncomingMessage, res: ServerResponse) {
    const mres = MultipartResponse.wrap(req, res);
    const {options, buildID} = this._prepareDeltaBundler(req, mres);

    const requestingAssetsLogEntry = log(
      createActionStartEntry({
        action_name: 'Requesting assets',
        bundle_url: req.url,
        entry_point: options.entryFile,
        bundler: 'delta',
      }),
    );

    let assets;

    try {
      assets = await this.getAssets(options);
    } catch (error) {
      this._handleError(mres, this._optionsHash(options), error);

      this._reporter.update({
        buildID,
        type: 'bundle_build_failed',
      });

      return;
    }

    mres.setHeader('Content-Type', 'application/json');
    mres.end(JSON.stringify(assets));

    this._reporter.update({
      buildID,
      type: 'bundle_build_done',
    });

    log(
      createActionEndEntry({
        ...requestingAssetsLogEntry,
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

    return await Serializers.fullSourceMapObject(this._deltaBundler, {
      ...options,
      deltaBundleId: this._optionsHash(options),
    });
  }

  _handleError(res: ServerResponse, bundleID: string, error: CustomError) {
    const formattedError = formatBundlingError(error);

    res.writeHead(error.status || 500, {
      'Content-Type': 'application/json; charset=UTF-8',
    });
    res.end(JSON.stringify(formattedError));
    this._reporter.update({error, type: 'bundling_error'});
  }

  _getOptionsFromUrl(reqUrl: string): BundleOptions & DeltaBundlerOptions {
    // `true` to parse the query param as an object.
    const urlObj = url.parse(reqUrl, true);

    /* $FlowFixMe: `pathname` could be empty for an invalid URL */
    const pathname = decodeURIComponent(urlObj.pathname);

    let isMap = false;

    // Backwards compatibility. Options used to be as added as '.' to the
    // entry module name. We can safely remove these options.
    const entryFile =
      pathname
        .replace(/^\//, '')
        .split('.')
        .filter(part => {
          if (part === 'map') {
            isMap = true;
            return false;
          }
          if (
            part === 'includeRequire' ||
            part === 'runModule' ||
            part === 'bundle' ||
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
    const includeSource = this._getBoolOptionFromQuery(
      urlObj.query,
      'inlineSourceMap',
      false,
    );

    return {
      sourceMapUrl: url.format({
        ...urlObj,
        pathname: pathname.replace(/\.(bundle|delta)$/, '.map'),
      }),
      bundleType: isMap ? 'map' : deltaBundleId ? 'delta' : 'bundle',
      entryFile,
      deltaBundleId,
      dev,
      minify,
      excludeSource,
      hot: true,
      runBeforeMainModule: this._opts.getModulesRunBeforeMainModule(entryFile),
      runModule: this._getBoolOptionFromQuery(urlObj.query, 'runModule', true),
      inlineSourceMap: includeSource,
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

  static DEFAULT_BUNDLE_OPTIONS = {
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

module.exports = Server;
