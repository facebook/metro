/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const Bundler = require('./Bundler');
const DeltaBundler = require('./DeltaBundler');
const MultipartResponse = require('./Server/MultipartResponse');

const crypto = require('crypto');
const defaultCreateModuleIdFactory = require('./lib/createModuleIdFactory');
const deltaJSBundle = require('./DeltaBundler/Serializers/deltaJSBundle');
const getAllFiles = require('./DeltaBundler/Serializers/getAllFiles');
const getAssets = require('./DeltaBundler/Serializers/getAssets');
const getRamBundleInfo = require('./DeltaBundler/Serializers/getRamBundleInfo');
const plainJSBundle = require('./DeltaBundler/Serializers/plainJSBundle');
const sourceMapObject = require('./DeltaBundler/Serializers/sourceMapObject');
const sourceMapString = require('./DeltaBundler/Serializers/sourceMapString');
const debug = require('debug')('Metro:Server');
const defaults = require('./defaults');
const formatBundlingError = require('./lib/formatBundlingError');
const getAbsolutePath = require('./lib/getAbsolutePath');
const getMaxWorkers = require('./lib/getMaxWorkers');
const getPrependedScripts = require('./lib/getPrependedScripts');
const mime = require('mime-types');
const nullthrows = require('fbjs/lib/nullthrows');
const parseCustomTransformOptions = require('./lib/parseCustomTransformOptions');
const parsePlatformFilePath = require('./node-haste/lib/parsePlatformFilePath');
const path = require('path');
const symbolicate = require('./Server/symbolicate/symbolicate');
const transformHelpers = require('./lib/transformHelpers');
const url = require('url');

const {getAsset} = require('./Assets');
const resolveSync: ResolveSync = require('resolve').sync;

import type {CustomError} from './lib/formatBundlingError';
import type {DeltaResult, Graph, Module, TransformResult} from './DeltaBundler';
import type {IncomingMessage, ServerResponse} from 'http';
import type {Reporter} from './lib/reporting';
import type {RamBundleInfo} from './DeltaBundler/Serializers/getRamBundleInfo';
import type {BundleOptions, Options} from './shared/types.flow';
import type {
  GetTransformOptions,
  PostMinifyProcess,
  PostProcessBundleSourcemap,
} from './Bundler';
import type {CacheStore} from 'metro-cache';
import type {CustomResolver} from 'metro-resolver';
import type {MetroSourceMap} from 'metro-source-map';
import type {Symbolicate} from './Server/symbolicate/symbolicate';
import type {AssetData} from './Assets';
import type {CustomTransformOptions} from './JSTransformer/worker';

const {
  Logger: {createActionStartEntry, createActionEndEntry, log},
} = require('metro-core');

type ResolveSync = (path: string, opts: ?{baseDir?: string}) => string;

type GraphInfo = {|
  graph: Graph<>,
  prepend: $ReadOnlyArray<Module<>>,
  lastModified: Date,
  +sequenceId: string,
|};

export type BuildGraphOptions = {|
  +assetPlugins: Array<string>,
  +customTransformOptions: CustomTransformOptions,
  +dev: boolean,
  +hot: boolean,
  +minify: boolean,
  +onProgress: ?(doneCont: number, totalCount: number) => mixed,
  +platform: ?string,
  +type: 'module' | 'script',
|};

export type OutputGraph = Graph<>;

type DeltaOptions = BundleOptions & {
  deltaBundleId: ?string,
};

function debounceAndBatch(fn, delay) {
  let timeout;
  return () => {
    clearTimeout(timeout);
    timeout = setTimeout(fn, delay);
  };
}

const DELTA_ID_HEADER = 'X-Metro-Delta-ID';
const FILES_CHANGED_COUNT_HEADER = 'X-Metro-Files-Changed-Count';

class Server {
  _opts: {
    assetExts: Array<string>,
    blacklistRE: void | RegExp,
    cacheStores: $ReadOnlyArray<CacheStore<TransformResult<>>>,
    cacheVersion: string,
    createModuleId: (path: string) => number,
    enableBabelRCLookup: boolean,
    extraNodeModules: {},
    getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
    getTransformOptions?: GetTransformOptions,
    hasteImplModulePath?: string,
    maxWorkers: number,
    minifierPath: string,
    platforms: Array<string>,
    resolveRequest: ?CustomResolver,
    polyfillModuleNames: Array<string>,
    postMinifyProcess: PostMinifyProcess,
    postProcessBundleSourcemap: PostProcessBundleSourcemap,
    projectRoots: $ReadOnlyArray<string>,
    providesModuleNodeModules?: Array<string>,
    reporter: Reporter,
    resolveRequest: ?CustomResolver,
    +getModulesRunBeforeMainModule: (entryFilePath: string) => Array<string>,
    +getRunModuleStatement: (number | string) => string,
    silent: boolean,
    +sourceExts: Array<string>,
    +transformModulePath: string,
    watch: boolean,
    workerPath: ?string,
  };
  _changeWatchers: Array<{
    req: IncomingMessage,
    res: ServerResponse,
  }>;
  _bundler: Bundler;
  _debouncedFileChangeHandler: (filePath: string) => mixed;
  _reporter: Reporter;
  _symbolicateInWorker: Symbolicate;
  _platforms: Set<string>;
  _nextBundleBuildID: number;
  _deltaBundler: DeltaBundler<>;
  _graphs: Map<string, Promise<GraphInfo>> = new Map();
  _deltaGraphs: Map<string, Promise<GraphInfo>> = new Map();

  constructor(options: Options) {
    const reporter =
      options.reporter || require('./lib/reporting').nullReporter;
    const maxWorkers = getMaxWorkers(options.maxWorkers);
    const assetExts = options.assetExts || defaults.assetExts;
    const sourceExts = options.sourceExts || defaults.sourceExts;

    const _createModuleId =
      /* $FlowFixMe(>=0.68.0 site=react_native_fb) This comment suppresses an
       * error found when Flow v0.68 was deployed. To see the error delete this
       * comment and run Flow. */
      options.createModuleId || defaultCreateModuleIdFactory();

    this._opts = {
      assetExts: options.assetTransforms ? [] : assetExts,
      assetRegistryPath: options.assetRegistryPath,
      blacklistRE: options.blacklistRE,
      cacheStores: options.cacheStores,
      cacheVersion: options.cacheVersion,
      dynamicDepsInPackages: options.dynamicDepsInPackages || 'throwAtRuntime',
      createModuleId: _createModuleId,
      enableBabelRCLookup:
        options.enableBabelRCLookup != null
          ? options.enableBabelRCLookup
          : true,
      extraNodeModules: options.extraNodeModules || {},
      getModulesRunBeforeMainModule: options.getModulesRunBeforeMainModule,
      getPolyfills: options.getPolyfills,
      getRunModuleStatement: options.getRunModuleStatement,
      getTransformOptions: options.getTransformOptions,
      hasteImplModulePath: options.hasteImplModulePath,
      maxWorkers,
      minifierPath:
        options.minifierPath == null
          ? defaults.DEFAULT_METRO_MINIFIER_PATH
          : resolveSync(options.minifierPath, {basedir: process.cwd()}),
      platforms: options.platforms || defaults.platforms,
      polyfillModuleNames: options.polyfillModuleNames || [],
      postMinifyProcess: options.postMinifyProcess,
      postProcessBundleSourcemap: options.postProcessBundleSourcemap,
      projectRoots: options.projectRoots,
      providesModuleNodeModules: options.providesModuleNodeModules,
      reporter,
      resolveRequest: options.resolveRequest,
      silent: options.silent || false,
      sourceExts: options.assetTransforms
        ? sourceExts.concat(assetExts)
        : sourceExts,
      transformModulePath:
        options.transformModulePath || defaults.transformModulePath,
      watch: options.watch || false,
      workerPath: options.workerPath,
    };

    if (options.resetCache) {
      options.cacheStores.forEach(store => store.clear());
      reporter.update({type: 'transform_cache_reset'});
    }

    const processFileChange = ({type, filePath}) =>
      this.onFileChange(type, filePath);

    this._reporter = reporter;
    this._changeWatchers = [];
    this._platforms = new Set(this._opts.platforms);

    // This slices out options that are not part of the strict BundlerOptions
    /* eslint-disable no-unused-vars */
    const {
      createModuleId,
      getModulesRunBeforeMainModule,
      getRunModuleStatement,
      silent,
      ...bundlerOptionsFromServerOptions
    } = this._opts;
    /* eslint-enable no-unused-vars */

    this._bundler = new Bundler({
      ...bundlerOptionsFromServerOptions,
      asyncRequireModulePath:
        options.asyncRequireModulePath ||
        'metro/src/lib/bundle-modules/asyncRequire',
    });

    // changes to the haste map can affect resolution of files in the bundle
    this._bundler.getDependencyGraph().then(dependencyGraph => {
      dependencyGraph
        .getWatcher()
        .on('change', ({eventsQueue}) =>
          eventsQueue.forEach(processFileChange),
        );
    });

    this._debouncedFileChangeHandler = debounceAndBatch(
      () => this._informChangeWatchers(),
      50,
    );

    this._symbolicateInWorker = symbolicate.createWorker();
    this._nextBundleBuildID = 1;

    this._deltaBundler = new DeltaBundler(this._bundler);
  }

  end() {
    this._deltaBundler.end();
    this._bundler.end();
  }

  getDeltaBundler(): DeltaBundler<> {
    return this._deltaBundler;
  }

  async build(options: BundleOptions): Promise<{code: string, map: string}> {
    const graphInfo = await this._buildGraph(options);

    const entryPoint = getAbsolutePath(
      options.entryFile,
      this._opts.projectRoots,
    );

    return {
      code: plainJSBundle(entryPoint, graphInfo.prepend, graphInfo.graph, {
        createModuleId: this._opts.createModuleId,
        getRunModuleStatement: this._opts.getRunModuleStatement,
        dev: options.dev,
        runBeforeMainModule: options.runBeforeMainModule,
        runModule: options.runModule,
        sourceMapUrl: options.sourceMapUrl,
      }),
      map: sourceMapString(graphInfo.prepend, graphInfo.graph, {
        excludeSource: options.excludeSource,
      }),
    };
  }

  async buildGraph(
    entryFiles: $ReadOnlyArray<string>,
    options: BuildGraphOptions,
  ): Promise<OutputGraph> {
    entryFiles = entryFiles.map(entryFile =>
      getAbsolutePath(entryFile, this._opts.projectRoots),
    );

    return await this._deltaBundler.buildGraph(entryFiles, {
      resolve: await transformHelpers.getResolveDependencyFn(
        this._bundler,
        options.platform,
      ),
      transform: await transformHelpers.getTransformFn(
        entryFiles,
        this._bundler,
        this._deltaBundler,
        options,
      ),
      onProgress: options.onProgress,
    });
  }

  async getRamBundleInfo(options: BundleOptions): Promise<RamBundleInfo> {
    const graphInfo = await this._buildGraph(options);

    const entryPoint = getAbsolutePath(
      options.entryFile,
      this._opts.projectRoots,
    );

    return await getRamBundleInfo(
      entryPoint,
      graphInfo.prepend,
      graphInfo.graph,
      {
        createModuleId: this._opts.createModuleId,
        dev: options.dev,
        excludeSource: options.excludeSource,
        getRunModuleStatement: this._opts.getRunModuleStatement,
        getTransformOptions: this._opts.getTransformOptions,
        platform: options.platform,
        runBeforeMainModule: options.runBeforeMainModule,
        runModule: options.runModule,
        sourceMapUrl: options.sourceMapUrl,
      },
    );
  }

  async getAssets(options: BundleOptions): Promise<$ReadOnlyArray<AssetData>> {
    const {graph} = await this._buildGraph(options);

    return await getAssets(graph, {
      assetPlugins: options.assetPlugins,
      platform: options.platform,
      projectRoots: this._opts.projectRoots,
    });
  }

  async getOrderedDependencyPaths(options: {
    +entryFile: string,
    +dev: boolean,
    +platform: string,
    +minify: boolean,
  }): Promise<Array<string>> {
    options = {
      ...Server.DEFAULT_BUNDLE_OPTIONS,
      ...options,
      bundleType: 'bundle',
    };

    const {prepend, graph} = await this._buildGraph(options);

    const platform =
      options.platform ||
      parsePlatformFilePath(options.entryFile, this._platforms).platform;

    return await getAllFiles(prepend, graph, {platform});
  }

  async _buildGraph(options: BundleOptions): Promise<GraphInfo> {
    const entryPoint = getAbsolutePath(
      options.entryFile,
      this._opts.projectRoots,
    );

    const crawlingOptions = {
      assetPlugins: options.assetPlugins,
      customTransformOptions: options.customTransformOptions,
      dev: options.dev,
      hot: options.hot,
      minify: options.minify,
      onProgress: options.onProgress,
      platform: options.platform,
      type: 'module',
    };

    const graph = await this._deltaBundler.buildGraph([entryPoint], {
      resolve: await transformHelpers.getResolveDependencyFn(
        this._bundler,
        options.platform,
      ),
      transform: await transformHelpers.getTransformFn(
        [entryPoint],
        this._bundler,
        this._deltaBundler,
        crawlingOptions,
      ),
      onProgress: options.onProgress,
    });

    const prepend = await getPrependedScripts(
      this._opts,
      crawlingOptions,
      this._bundler,
      this._deltaBundler,
    );

    return {
      prepend,
      graph,
      lastModified: new Date(),
      sequenceId: crypto.randomBytes(8).toString('hex'),
    };
  }

  async _getGraphInfo(
    options: BundleOptions,
    {rebuild}: {rebuild: boolean},
  ): Promise<{...GraphInfo, numModifiedFiles: number}> {
    const id = this._optionsHash(options);
    let graphPromise = this._graphs.get(id);
    let graphInfo: GraphInfo;
    let numModifiedFiles = 0;

    if (!graphPromise) {
      graphPromise = this._buildGraph(options);
      this._graphs.set(id, graphPromise);

      graphInfo = await graphPromise;
      numModifiedFiles =
        graphInfo.prepend.length + graphInfo.graph.dependencies.size;
    } else {
      graphInfo = await graphPromise;

      if (rebuild) {
        const delta = await this._deltaBundler.getDelta(graphInfo.graph, {
          reset: false,
        });
        numModifiedFiles = delta.modified.size;
      }

      if (numModifiedFiles > 0) {
        graphInfo.lastModified = new Date();
      }
    }

    return {...graphInfo, numModifiedFiles};
  }

  async _getDeltaInfo(
    options: DeltaOptions,
  ): Promise<{...GraphInfo, delta: DeltaResult<>}> {
    const id = this._optionsHash(options);
    let graphPromise = this._deltaGraphs.get(id);
    let graphInfo;

    let delta;

    if (!graphPromise) {
      graphPromise = this._buildGraph(options);
      this._deltaGraphs.set(id, graphPromise);
      graphInfo = await graphPromise;

      delta = {
        modified: graphInfo.graph.dependencies,
        deleted: new Set(),
        reset: true,
      };
    } else {
      graphInfo = await graphPromise;

      delta = await this._deltaBundler.getDelta(graphInfo.graph, {
        reset: graphInfo.sequenceId !== options.deltaBundleId,
      });

      // Generate a new sequenceId, to be used to verify the next delta request.
      // $FlowIssue #16581373 spread of an exact object should be exact
      graphInfo = {
        ...graphInfo,
        sequenceId: crypto.randomBytes(8).toString('hex'),
      };

      this._deltaGraphs.set(id, graphInfo);
    }

    return {
      ...graphInfo,
      delta,
    };
  }

  onFileChange(type: string, filePath: string) {
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
      bundleType: null,
      onProgress: null,
      deltaBundleId: null,
      excludeSource: null,
      sourceMapUrl: null,
    };

    return JSON.stringify(Object.assign({}, options, ignoredParams));
  }

  processRequest = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: ?() => mixed,
  ) => {
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
  };

  _prepareDeltaBundler(
    req: IncomingMessage,
    mres: MultipartResponse,
  ): {options: DeltaOptions, buildID: string} {
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

    /* $FlowFixMe(>=0.63.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.63 was deployed. To see the error delete this
     * comment and run Flow. */
    this._reporter.update({
      buildID,
      bundleDetails: {
        entryFile: options.entryFile,
        platform: options.platform,
        dev: options.dev,
        minify: options.minify,
        bundleType: options.bundleType,
      },
      type: 'bundle_build_started',
    });

    return {options, buildID};
  }

  async _processDeltaRequest(req: IncomingMessage, res: ServerResponse) {
    const mres = MultipartResponse.wrap(req, res);
    const {options, buildID} = this._prepareDeltaBundler(req, mres);

    // Make sure that the bundleType is 'delta' (on the first delta request,
    // since the request does not have a bundleID param it gets detected as
    // a 'bundle' type).
    // TODO (T23416372): Improve the parsing of URL params.
    options.bundleType = 'delta';

    const requestingBundleLogEntry = log(
      createActionStartEntry({
        action_name: 'Requesting delta',
        bundle_url: req.url,
        entry_point: options.entryFile,
      }),
    );

    let output, sequenceId;

    try {
      let delta, graph, prepend;
      ({delta, graph, prepend, sequenceId} = await this._getDeltaInfo(options));

      output = {
        bundle: deltaJSBundle(
          options.entryFile,
          prepend,
          delta,
          sequenceId,
          graph,
          {
            createModuleId: this._opts.createModuleId,
            dev: options.dev,
            getRunModuleStatement: this._opts.getRunModuleStatement,
            runBeforeMainModule: options.runBeforeMainModule,
            runModule: options.runModule,
            sourceMapUrl: options.sourceMapUrl,
          },
        ),
        numModifiedFiles: delta.modified.size + delta.deleted.size,
      };
    } catch (error) {
      this._handleError(mres, this._optionsHash(options), error);

      this._reporter.update({
        buildID,
        type: 'bundle_build_failed',
      });

      return;
    }

    mres.setHeader(FILES_CHANGED_COUNT_HEADER, String(output.numModifiedFiles));
    mres.setHeader(DELTA_ID_HEADER, String(sequenceId));
    mres.setHeader('Content-Type', 'application/json');
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
      const {
        graph,
        prepend,
        lastModified,
        numModifiedFiles,
      } = await this._getGraphInfo(options, {rebuild: true});

      result = {
        bundle: plainJSBundle(options.entryFile, prepend, graph, {
          createModuleId: this._opts.createModuleId,
          getRunModuleStatement: this._opts.getRunModuleStatement,
          dev: options.dev,
          runBeforeMainModule: options.runBeforeMainModule,
          runModule: options.runModule,
          sourceMapUrl: options.sourceMapUrl,
        }),
        numModifiedFiles,
        lastModified,
      };
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
      const {graph, prepend} = await this._getGraphInfo(options, {
        rebuild: false,
      });

      sourceMap = sourceMapString(prepend, graph, {
        excludeSource: options.excludeSource,
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
            sourceUrl != null &&
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

  async _sourceMapForURL(reqUrl: string): Promise<MetroSourceMap> {
    const options: DeltaOptions = this._getOptionsFromUrl(reqUrl);

    const {graph, prepend} = await this._getGraphInfo(options, {
      rebuild: false,
    });

    return sourceMapObject(prepend, graph, {
      excludeSource: options.excludeSource,
    });
  }

  _handleError(res: ServerResponse, bundleID: string, error: CustomError) {
    const formattedError = formatBundlingError(error);

    res.writeHead(error.status || 500, {
      'Content-Type': 'application/json; charset=UTF-8',
    });
    res.end(JSON.stringify(formattedError));
    this._reporter.update({error, type: 'bundling_error'});

    log({
      action_name: 'bundling_error',
      error_type: formattedError.type,
      log_entry_label: 'bundling_error',
      stack: formattedError.message,
    });
  }

  _getOptionsFromUrl(reqUrl: string): DeltaOptions {
    // `true` to parse the query param as an object.
    const urlObj = nullthrows(url.parse(reqUrl, true));
    const urlQuery = nullthrows(urlObj.query);

    const pathname = urlObj.pathname ? decodeURIComponent(urlObj.pathname) : '';

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

    const absoluteEntryFile = getAbsolutePath(
      entryFile,
      this._opts.projectRoots,
    );

    // try to get the platform from the url
    const platform =
      urlQuery.platform ||
      parsePlatformFilePath(pathname, this._platforms).platform;

    const deltaBundleId = urlQuery.deltaBundleId;

    const assetPlugin = urlQuery.assetPlugin;
    const assetPlugins = Array.isArray(assetPlugin)
      ? assetPlugin
      : typeof assetPlugin === 'string'
        ? [assetPlugin]
        : [];

    const dev = this._getBoolOptionFromQuery(urlQuery, 'dev', true);
    const minify = this._getBoolOptionFromQuery(urlQuery, 'minify', false);
    const excludeSource = this._getBoolOptionFromQuery(
      urlQuery,
      'excludeSource',
      false,
    );
    const includeSource = this._getBoolOptionFromQuery(
      urlQuery,
      'inlineSourceMap',
      false,
    );

    const customTransformOptions = parseCustomTransformOptions(urlObj);

    return {
      sourceMapUrl: url.format({
        ...urlObj,
        pathname: pathname.replace(/\.(bundle|delta)$/, '.map'),
      }),
      bundleType: isMap ? 'map' : deltaBundleId ? 'delta' : 'bundle',
      customTransformOptions,
      entryFile: absoluteEntryFile,
      deltaBundleId,
      dev,
      minify,
      excludeSource,
      hot: true,
      runBeforeMainModule: this._opts.getModulesRunBeforeMainModule(entryFile),
      runModule: this._getBoolOptionFromQuery(urlObj.query, 'runModule', true),
      inlineSourceMap: includeSource,
      platform,
      entryModuleOnly: this._getBoolOptionFromQuery(
        urlObj.query,
        'entryModuleOnly',
        false,
      ),
      assetPlugins,
      onProgress: null,
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

  getReporter(): Reporter {
    return this._reporter;
  }

  getProjectRoots(): $ReadOnlyArray<string> {
    return this._opts.projectRoots;
  }

  static DEFAULT_GRAPH_OPTIONS = {
    assetPlugins: [],
    customTransformOptions: Object.create(null),
    dev: true,
    hot: false,
    minify: false,
    onProgress: null,
    type: 'module',
  };

  static DEFAULT_BUNDLE_OPTIONS = {
    ...Server.DEFAULT_GRAPH_OPTIONS,
    entryModuleOnly: false,
    excludeSource: false,
    inlineSourceMap: false,
    runBeforeMainModule: [],
    runModule: true,
    sourceMapUrl: null,
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
