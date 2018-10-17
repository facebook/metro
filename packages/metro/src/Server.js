/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const IncrementalBundler = require('./IncrementalBundler');
const MultipartResponse = require('./Server/MultipartResponse');

const deltaJSBundle = require('./DeltaBundler/Serializers/deltaJSBundle');
const getAllFiles = require('./DeltaBundler/Serializers/getAllFiles');
const getAssets = require('./DeltaBundler/Serializers/getAssets');
const getRamBundleInfo = require('./DeltaBundler/Serializers/getRamBundleInfo');
const plainJSBundle = require('./DeltaBundler/Serializers/plainJSBundle');
const sourceMapObject = require('./DeltaBundler/Serializers/sourceMapObject');
const sourceMapString = require('./DeltaBundler/Serializers/sourceMapString');
const debug = require('debug')('Metro:Server');
const formatBundlingError = require('./lib/formatBundlingError');
const mime = require('mime-types');
const parseOptionsFromUrl = require('./lib/parseOptionsFromUrl');
const parsePlatformFilePath = require('./node-haste/lib/parsePlatformFilePath');
const path = require('path');
const symbolicate = require('./Server/symbolicate/symbolicate');
const url = require('url');

const {getAsset} = require('./Assets');

import type {CustomError} from './lib/formatBundlingError';
import type {IncomingMessage, ServerResponse} from 'http';
import type {Reporter} from './lib/reporting';
import type {RamBundleInfo} from './DeltaBundler/Serializers/getRamBundleInfo';
import type {BundleOptions} from './shared/types.flow';
import type {ConfigT} from 'metro-config/src/configTypes.flow';
import type {MetroSourceMap} from 'metro-source-map';
import type {Symbolicate} from './Server/symbolicate/symbolicate';
import type {AssetData} from './Assets';

const {
  Logger,
  Logger: {createActionStartEntry, createActionEndEntry, log},
} = require('metro-core');

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
  _config: ConfigT;
  _changeWatchers: Array<{
    req: IncomingMessage,
    res: ServerResponse,
  }>;
  _createModuleId: (path: string) => number;
  _reporter: Reporter;
  _logger: typeof Logger;
  _symbolicateInWorker: Symbolicate;
  _platforms: Set<string>;
  _nextBundleBuildID: number;
  _bundler: IncrementalBundler;

  constructor(config: ConfigT) {
    this._config = config;

    if (this._config.resetCache) {
      this._config.cacheStores.forEach(store => store.clear());
      this._config.reporter.update({type: 'transform_cache_reset'});
    }

    this._reporter = config.reporter;
    this._logger = Logger;
    this._changeWatchers = [];
    this._platforms = new Set(this._config.resolver.platforms);

    // TODO(T34760917): These two properties should eventually be instantiated
    // elsewhere and passed as parameters, since they are also needed by
    // the HmrServer.
    // The whole bundling/serializing logic should follow as well.
    this._createModuleId = config.serializer.createModuleIdFactory();
    this._bundler = new IncrementalBundler(config);

    const debouncedFileChangeHandler = debounceAndBatch(
      () => this._informChangeWatchers(),
      50,
    );

    // changes to the haste map can affect resolution of files in the bundle
    this._bundler
      .getBundler()
      .getDependencyGraph()
      .then(dependencyGraph => {
        dependencyGraph.getWatcher().on('change', () => {
          // Make sure the file watcher event runs through the system before
          // we rebuild the bundles.
          debouncedFileChangeHandler();
        });
      });

    this._symbolicateInWorker = symbolicate.createWorker();
    this._nextBundleBuildID = 1;
  }

  end() {
    this._bundler.end();
  }

  getBundler(): IncrementalBundler {
    return this._bundler;
  }

  getCreateModuleId(): (path: string) => number {
    return this._createModuleId;
  }

  async build(options: BundleOptions): Promise<{code: string, map: string}> {
    const rev = await this._bundler.buildGraph(options);

    const entryPoint = path.resolve(
      this._config.projectRoot,
      options.entryFile,
    );

    return {
      code: plainJSBundle(entryPoint, rev.prepend, rev.graph, {
        processModuleFilter: this._config.serializer.processModuleFilter,
        createModuleId: this._createModuleId,
        getRunModuleStatement: this._config.serializer.getRunModuleStatement,
        dev: options.dev,
        projectRoot: this._config.projectRoot,
        runBeforeMainModule: this._config.serializer.getModulesRunBeforeMainModule(
          path.relative(this._config.projectRoot, entryPoint),
        ),
        runModule: options.runModule,
        sourceMapUrl: options.sourceMapUrl,
        inlineSourceMap: options.inlineSourceMap,
      }),
      map: sourceMapString(rev.prepend, rev.graph, {
        excludeSource: options.excludeSource,
        processModuleFilter: this._config.serializer.processModuleFilter,
      }),
    };
  }

  async getRamBundleInfo(options: BundleOptions): Promise<RamBundleInfo> {
    const rev = await this._bundler.buildGraph(options);

    const entryPoint = path.resolve(
      this._config.projectRoot,
      options.entryFile,
    );

    return await getRamBundleInfo(entryPoint, rev.prepend, rev.graph, {
      processModuleFilter: this._config.serializer.processModuleFilter,
      createModuleId: this._createModuleId,
      dev: options.dev,
      excludeSource: options.excludeSource,
      getRunModuleStatement: this._config.serializer.getRunModuleStatement,
      getTransformOptions: this._config.transformer.getTransformOptions,
      platform: options.platform,
      projectRoot: this._config.projectRoot,
      runBeforeMainModule: this._config.serializer.getModulesRunBeforeMainModule(
        path.relative(this._config.projectRoot, entryPoint),
      ),
      runModule: options.runModule,
      sourceMapUrl: options.sourceMapUrl,
      inlineSourceMap: options.inlineSourceMap,
    });
  }

  async getAssets(options: BundleOptions): Promise<$ReadOnlyArray<AssetData>> {
    const {graph} = await this._bundler.buildGraph(options);

    return await getAssets(graph, {
      processModuleFilter: this._config.serializer.processModuleFilter,
      assetPlugins: this._config.transformer.assetPlugins,
      platform: options.platform,
      projectRoot: this._config.projectRoot,
    });
  }

  async getOrderedDependencyPaths(options: {
    +entryFile: string,
    +dev: boolean,
    +minify: boolean,
    +platform: string,
  }): Promise<Array<string>> {
    options = {
      ...Server.DEFAULT_BUNDLE_OPTIONS,
      ...options,
      bundleType: 'bundle',
    };

    const {prepend, graph} = await this._bundler.buildGraph(options);

    const platform =
      options.platform ||
      parsePlatformFilePath(options.entryFile, this._platforms).platform;

    return await getAllFiles(prepend, graph, {
      platform,
      processModuleFilter: this._config.serializer.processModuleFilter,
    });
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
        this._config.projectRoot,
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
  ): {options: BundleOptions, revisionId: ?string, buildID: string} {
    const {revisionId, options} = parseOptionsFromUrl(
      url.format({
        ...url.parse(req.url),
        protocol: 'http',
        host: req.headers.host,
      }),
      this._config.projectRoot,
      new Set(this._config.resolver.platforms),
    );

    const buildID = this.getNewBuildID();

    if (this._config.reporter) {
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

    return {options, revisionId, buildID};
  }

  async _processDeltaRequest(req: IncomingMessage, res: ServerResponse) {
    const mres = MultipartResponse.wrap(req, res);
    const {options, revisionId, buildID} = this._prepareDeltaBundler(req, mres);

    const requestingBundleLogEntry = log(
      createActionStartEntry({
        action_name: 'Requesting delta',
        bundle_url: req.url,
        entry_point: options.entryFile,
      }),
    );

    let bundle, nextRevId, numModifiedFiles;

    try {
      const {delta, revision} = await this._bundler.updateGraph(options, {
        revisionId,
      });

      bundle = deltaJSBundle(
        options.entryFile,
        revision.prepend,
        delta,
        revision.id,
        revision.graph,
        {
          processModuleFilter: this._config.serializer.processModuleFilter,
          createModuleId: this._createModuleId,
          dev: options.dev,
          getRunModuleStatement: this._config.serializer.getRunModuleStatement,
          projectRoot: this._config.projectRoot,
          runBeforeMainModule: this._config.serializer.getModulesRunBeforeMainModule(
            path.relative(this._config.projectRoot, options.entryFile),
          ),
          runModule: options.runModule,
          sourceMapUrl: options.sourceMapUrl,
          inlineSourceMap: options.inlineSourceMap,
        },
      );

      numModifiedFiles = delta.modified.size + delta.deleted.size;
      nextRevId = revision.id;
    } catch (error) {
      this._handleError(mres, options, error, buildID);

      this._reporter.update({
        buildID,
        type: 'bundle_build_failed',
      });

      return;
    }

    mres.setHeader(FILES_CHANGED_COUNT_HEADER, String(numModifiedFiles));
    mres.setHeader(DELTA_ID_HEADER, String(nextRevId));
    mres.setHeader('Content-Type', 'application/json');
    mres.setHeader('Content-Length', String(Buffer.byteLength(bundle)));
    mres.end(bundle);

    this._reporter.update({
      buildID,
      type: 'bundle_build_done',
    });

    debug('Finished response');
    log({
      ...createActionEndEntry(requestingBundleLogEntry),
      outdated_modules: numModifiedFiles,
    });
  }

  async _processBundleRequest(req: IncomingMessage, res: ServerResponse) {
    const mres = MultipartResponse.wrap(req, res);
    const {options, buildID} = this._prepareDeltaBundler(req, mres);

    const hash = IncrementalBundler.getGraphId(options);

    const requestingBundleLogEntry = log(
      createActionStartEntry({
        action_name: 'Requesting bundle',
        bundle_url: req.url,
        entry_point: options.entryFile,
        bundler: 'delta',
        build_id: buildID,
        bundle_options: options,
        bundle_hash: hash,
      }),
    );

    let bundle, numModifiedFiles, lastModifiedDate;

    try {
      const {delta, revision} = await this._bundler.updateGraph(options, {
        rebuild: true,
      });

      bundle = plainJSBundle(
        options.entryFile,
        revision.prepend,
        revision.graph,
        {
          processModuleFilter: this._config.serializer.processModuleFilter,
          createModuleId: this._createModuleId,
          getRunModuleStatement: this._config.serializer.getRunModuleStatement,
          dev: options.dev,
          projectRoot: this._config.projectRoot,
          runBeforeMainModule: this._config.serializer.getModulesRunBeforeMainModule(
            path.relative(this._config.projectRoot, options.entryFile),
          ),
          runModule: options.runModule,
          sourceMapUrl: options.sourceMapUrl,
          inlineSourceMap: options.inlineSourceMap,
        },
      );

      numModifiedFiles = delta.reset
        ? delta.modified.size + revision.prepend.length
        : delta.modified.size + delta.deleted.size;
      lastModifiedDate = revision.date;
    } catch (error) {
      this._handleError(mres, options, error, buildID);

      return;
    }

    if (
      // We avoid parsing the dates since the client should never send a more
      // recent date than the one returned by the Delta Bundler (if that's the
      // case it's fine to return the whole bundle).
      req.headers['if-modified-since'] === lastModifiedDate.toUTCString()
    ) {
      debug('Responding with 304');
      mres.writeHead(304);
      mres.end();
    } else {
      mres.setHeader(FILES_CHANGED_COUNT_HEADER, String(numModifiedFiles));
      mres.setHeader('Content-Type', 'application/javascript');
      mres.setHeader('Last-Modified', lastModifiedDate.toUTCString());
      mres.setHeader('Content-Length', String(Buffer.byteLength(bundle)));
      mres.end(bundle);
    }

    this._reporter.update({
      buildID,
      type: 'bundle_build_done',
    });

    debug('Finished response');
    log({
      ...createActionEndEntry(requestingBundleLogEntry),
      outdated_modules: numModifiedFiles,
      bundler: 'delta',
      bundle_size: bundle.length,
      build_id: buildID,
      bundle_options: options,
      bundle_hash: hash,
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
      const {revision} = await this._bundler.updateGraph(options, {
        rebuild: false,
      });

      sourceMap = sourceMapString(revision.prepend, revision.graph, {
        excludeSource: options.excludeSource,
        processModuleFilter: this._config.serializer.processModuleFilter,
      });
    } catch (error) {
      this._handleError(mres, options, error, buildID);

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
      this._handleError(mres, options, error, buildID);

      this._reporter.update({
        buildID,
        type: 'bundle_build_failed',
        bundleOptions: options,
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
    const {options} = parseOptionsFromUrl(
      reqUrl,
      this._config.projectRoot,
      new Set(this._config.resolver.platforms),
    );

    const {revision} = await this._bundler.updateGraph(options, {
      rebuild: false,
    });

    return sourceMapObject(revision.prepend, revision.graph, {
      excludeSource: options.excludeSource,
      processModuleFilter: this._config.serializer.processModuleFilter,
    });
  }

  _handleError(
    res: ServerResponse,
    options: BundleOptions,
    error: CustomError,
    buildID: string,
  ) {
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
      bundle_id: IncrementalBundler.getGraphId(options),
      build_id: buildID,
      stack: formattedError.message,
    });
  }

  getNewBuildID(): string {
    return (this._nextBundleBuildID++).toString(36);
  }

  getWatchFolders(): $ReadOnlyArray<string> {
    return this._config.watchFolders;
  }

  static DEFAULT_GRAPH_OPTIONS = {
    customTransformOptions: Object.create(null),
    dev: true,
    hot: false,
    minify: false,
    type: 'module',
  };

  static DEFAULT_BUNDLE_OPTIONS = {
    ...Server.DEFAULT_GRAPH_OPTIONS,
    excludeSource: false,
    inlineSourceMap: false,
    onProgress: null,
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
