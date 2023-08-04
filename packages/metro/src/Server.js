/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

import type {StackFrameOutput} from './Server/symbolicate';
import type {AssetData} from './Assets';
import type {ExplodedSourceMap} from './DeltaBundler/Serializers/getExplodedSourceMap';
import type {RamBundleInfo} from './DeltaBundler/Serializers/getRamBundleInfo';
import type {
  MixedOutput,
  Module,
  ReadOnlyGraph,
  TransformInputOptions,
  TransformResult,
} from './DeltaBundler/types.flow';
import type {RevisionId} from './IncrementalBundler';
import type {GraphId} from './lib/getGraphId';
import type {Reporter} from './lib/reporting';
import type {
  BundleOptions,
  GraphOptions,
  ResolverInputOptions,
  SplitBundleOptions,
} from './shared/types.flow';
import type {IncomingMessage} from 'connect';
import type {ServerResponse} from 'http';
import type {CacheStore} from 'metro-cache';
import type {ConfigT, RootPerfLogger} from 'metro-config/src/configTypes.flow';
import type {
  ActionLogEntryData,
  ActionStartLogEntry,
  LogEntry,
} from 'metro-core/src/Logger';
import type {CustomResolverOptions} from 'metro-resolver/src/types';
import type {CustomTransformOptions} from 'metro-transform-worker';

const {getAsset} = require('./Assets');
const baseJSBundle = require('./DeltaBundler/Serializers/baseJSBundle');
const getAllFiles = require('./DeltaBundler/Serializers/getAllFiles');
const getAssets = require('./DeltaBundler/Serializers/getAssets');
const {
  getExplodedSourceMap,
} = require('./DeltaBundler/Serializers/getExplodedSourceMap');
const getRamBundleInfo = require('./DeltaBundler/Serializers/getRamBundleInfo');
const sourceMapString = require('./DeltaBundler/Serializers/sourceMapString');
const IncrementalBundler = require('./IncrementalBundler');
const ResourceNotFoundError = require('./IncrementalBundler/ResourceNotFoundError');
const bundleToString = require('./lib/bundleToString');
const formatBundlingError = require('./lib/formatBundlingError');
const getGraphId = require('./lib/getGraphId');
const parseOptionsFromUrl = require('./lib/parseOptionsFromUrl');
const splitBundleOptions = require('./lib/splitBundleOptions');
const transformHelpers = require('./lib/transformHelpers');
const parsePlatformFilePath = require('./node-haste/lib/parsePlatformFilePath');
const symbolicate = require('./Server/symbolicate');
const {codeFrameColumns} = require('@babel/code-frame');
const MultipartResponse = require('./Server/MultipartResponse');
const {performance} = require('perf_hooks');
const debug = require('debug')('Metro:Server');
const fs = require('graceful-fs');
const invariant = require('invariant');
const jscSafeUrl = require('jsc-safe-url');
const {
  Logger,
  Logger: {createActionStartEntry, createActionEndEntry, log},
} = require('metro-core');

const mime = require('mime-types');
const nullthrows = require('nullthrows');
const path = require('path');
const querystring = require('querystring');
const url = require('url');

const noopLogger: RootPerfLogger = {
  start: () => {},
  point: () => {},
  annotate: () => {},
  subSpan: () => noopLogger,
  end: () => {},
};

export type SegmentLoadData = {[number]: [Array<number>, ?number], ...};
export type BundleMetadata = {
  hash: string,
  otaBuildNumber: ?string,
  mobileConfigs: Array<string>,
  segmentHashes: Array<string>,
  segmentLoadData: SegmentLoadData,
  ...
};

type ProcessStartContext = {
  +buildNumber: number,
  +bundleOptions: BundleOptions,
  +graphId: GraphId,
  +graphOptions: GraphOptions,
  +mres: MultipartResponse | ServerResponse,
  +req: IncomingMessage,
  +revisionId?: ?RevisionId,
  +bundlePerfLogger: RootPerfLogger,
  +requestStartTimestamp: number,
  ...SplitBundleOptions,
};

type ProcessDeleteContext = {
  +graphId: GraphId,
  +req: IncomingMessage,
  +res: ServerResponse,
};

type ProcessEndContext<T> = {
  ...ProcessStartContext,
  +result: T,
};

export type ServerOptions = $ReadOnly<{
  hasReducedPerformance?: boolean,
  onBundleBuilt?: (bundlePath: string) => void,
  watch?: boolean,
}>;

const DELTA_ID_HEADER = 'X-Metro-Delta-ID';
const FILES_CHANGED_COUNT_HEADER = 'X-Metro-Files-Changed-Count';

class Server {
  _bundler: IncrementalBundler;
  _config: ConfigT;
  _createModuleId: (path: string) => number;
  _isEnded: boolean;
  _logger: typeof Logger;
  _nextBundleBuildNumber: number;
  _platforms: Set<string>;
  _reporter: Reporter;
  _serverOptions: ServerOptions | void;

  constructor(config: ConfigT, options?: ServerOptions) {
    this._config = config;
    this._serverOptions = options;

    if (this._config.resetCache) {
      this._config.cacheStores.forEach((store: CacheStore<TransformResult<>>) =>
        store.clear(),
      );
      this._config.reporter.update({type: 'transform_cache_reset'});
    }

    this._reporter = config.reporter;
    this._logger = Logger;
    this._platforms = new Set(this._config.resolver.platforms);
    this._isEnded = false;

    // TODO(T34760917): These two properties should eventually be instantiated
    // elsewhere and passed as parameters, since they are also needed by
    // the HmrServer.
    // The whole bundling/serializing logic should follow as well.
    this._createModuleId = config.serializer.createModuleIdFactory();
    this._bundler = new IncrementalBundler(config, {
      hasReducedPerformance: options && options.hasReducedPerformance,
      watch: options ? options.watch : undefined,
    });
    this._nextBundleBuildNumber = 1;
  }

  end() {
    if (!this._isEnded) {
      this._bundler.end();
      this._isEnded = true;
    }
  }

  getBundler(): IncrementalBundler {
    return this._bundler;
  }

  getCreateModuleId(): (path: string) => number {
    return this._createModuleId;
  }

  async build(options: BundleOptions): Promise<{
    code: string,
    map: string,
    ...
  }> {
    const {
      entryFile,
      graphOptions,
      onProgress,
      resolverOptions,
      serializerOptions,
      transformOptions,
    } = splitBundleOptions(options);

    const {prepend, graph} = await this._bundler.buildGraph(
      entryFile,
      transformOptions,
      resolverOptions,
      {
        onProgress,
        shallow: graphOptions.shallow,
        lazy: graphOptions.lazy,
      },
    );

    const entryPoint = this._getEntryPointAbsolutePath(entryFile);

    const bundleOptions = {
      asyncRequireModulePath: await this._resolveRelativePath(
        this._config.transformer.asyncRequireModulePath,
        {
          relativeTo: 'project',
          resolverOptions,
          transformOptions,
        },
      ),
      processModuleFilter: this._config.serializer.processModuleFilter,
      createModuleId: this._createModuleId,
      getRunModuleStatement: this._config.serializer.getRunModuleStatement,
      dev: transformOptions.dev,
      includeAsyncPaths: graphOptions.lazy,
      projectRoot: this._config.projectRoot,
      modulesOnly: serializerOptions.modulesOnly,
      runBeforeMainModule:
        this._config.serializer.getModulesRunBeforeMainModule(
          path.relative(this._config.projectRoot, entryPoint),
        ),
      runModule: serializerOptions.runModule,
      sourceMapUrl: serializerOptions.sourceMapUrl,
      sourceUrl: serializerOptions.sourceUrl,
      inlineSourceMap: serializerOptions.inlineSourceMap,
      serverRoot:
        this._config.server.unstable_serverRoot ?? this._config.projectRoot,
      shouldAddToIgnoreList: (module: Module<>) =>
        this._shouldAddModuleToIgnoreList(module),
    };
    let bundleCode = null;
    let bundleMap = null;
    if (this._config.serializer.customSerializer) {
      const bundle = await this._config.serializer.customSerializer(
        entryPoint,
        prepend,
        graph,
        bundleOptions,
      );
      if (typeof bundle === 'string') {
        bundleCode = bundle;
      } else {
        bundleCode = bundle.code;
        bundleMap = bundle.map;
      }
    } else {
      bundleCode = bundleToString(
        baseJSBundle(entryPoint, prepend, graph, bundleOptions),
      ).code;
    }
    if (!bundleMap) {
      bundleMap = sourceMapString(
        [...prepend, ...this._getSortedModules(graph)],
        {
          excludeSource: serializerOptions.excludeSource,
          processModuleFilter: this._config.serializer.processModuleFilter,
          shouldAddToIgnoreList: bundleOptions.shouldAddToIgnoreList,
        },
      );
    }
    return {
      code: bundleCode,
      map: bundleMap,
    };
  }

  async getRamBundleInfo(options: BundleOptions): Promise<RamBundleInfo> {
    const {
      entryFile,
      graphOptions,
      onProgress,
      resolverOptions,
      serializerOptions,
      transformOptions,
    } = splitBundleOptions(options);

    const {prepend, graph} = await this._bundler.buildGraph(
      entryFile,
      transformOptions,
      resolverOptions,
      {
        onProgress,
        shallow: graphOptions.shallow,
        lazy: graphOptions.lazy,
      },
    );

    const entryPoint = this._getEntryPointAbsolutePath(entryFile);

    return await getRamBundleInfo(entryPoint, prepend, graph, {
      asyncRequireModulePath: await this._resolveRelativePath(
        this._config.transformer.asyncRequireModulePath,
        {
          relativeTo: 'project',
          resolverOptions,
          transformOptions,
        },
      ),
      processModuleFilter: this._config.serializer.processModuleFilter,
      createModuleId: this._createModuleId,
      dev: transformOptions.dev,
      excludeSource: serializerOptions.excludeSource,
      getRunModuleStatement: this._config.serializer.getRunModuleStatement,
      getTransformOptions: this._config.transformer.getTransformOptions,
      includeAsyncPaths: graphOptions.lazy,
      platform: transformOptions.platform,
      projectRoot: this._config.projectRoot,
      modulesOnly: serializerOptions.modulesOnly,
      runBeforeMainModule:
        this._config.serializer.getModulesRunBeforeMainModule(
          path.relative(this._config.projectRoot, entryPoint),
        ),
      runModule: serializerOptions.runModule,
      sourceMapUrl: serializerOptions.sourceMapUrl,
      sourceUrl: serializerOptions.sourceUrl,
      inlineSourceMap: serializerOptions.inlineSourceMap,
      serverRoot:
        this._config.server.unstable_serverRoot ?? this._config.projectRoot,
      shouldAddToIgnoreList: (module: Module<>) =>
        this._shouldAddModuleToIgnoreList(module),
    });
  }

  async getAssets(options: BundleOptions): Promise<$ReadOnlyArray<AssetData>> {
    const {entryFile, onProgress, resolverOptions, transformOptions} =
      splitBundleOptions(options);

    const dependencies = await this._bundler.getDependencies(
      [entryFile],
      transformOptions,
      resolverOptions,
      {onProgress, shallow: false, lazy: false},
    );

    return await getAssets(dependencies, {
      processModuleFilter: this._config.serializer.processModuleFilter,
      assetPlugins: this._config.transformer.assetPlugins,
      platform: transformOptions.platform,
      projectRoot: this._getServerRootDir(),
      publicPath: this._config.transformer.publicPath,
    });
  }

  async getOrderedDependencyPaths(options: {
    +dev: boolean,
    +entryFile: string,
    +minify: boolean,
    +platform: ?string,
    ...
  }): Promise<Array<string>> {
    const {
      entryFile,
      onProgress,
      resolverOptions,
      transformOptions,
      /* $FlowFixMe(>=0.122.0 site=react_native_fb) This comment suppresses an
       * error found when Flow v0.122.0 was deployed. To see the error, delete
       * this comment and run Flow. */
    } = splitBundleOptions({
      ...Server.DEFAULT_BUNDLE_OPTIONS,
      ...options,
      bundleType: 'bundle',
    });

    const {prepend, graph} = await this._bundler.buildGraph(
      entryFile,
      transformOptions,
      resolverOptions,
      {onProgress, shallow: false, lazy: false},
    );

    const platform =
      transformOptions.platform ||
      parsePlatformFilePath(entryFile, this._platforms).platform;

    // $FlowFixMe[incompatible-return]
    return await getAllFiles(prepend, graph, {
      platform,
      processModuleFilter: this._config.serializer.processModuleFilter,
    });
  }

  _rangeRequestMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    data: string | Buffer,
    assetPath: string,
  ): Buffer | string {
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
      });

      return data.slice(dataStart, dataEnd + 1);
    }

    res.setHeader('Content-Length', String(Buffer.byteLength(data)));

    return data;
  }

  async _processSingleAssetRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const urlObj = url.parse(decodeURI(req.url), true);
    let [, assetPath] =
      (urlObj &&
        urlObj.pathname &&
        urlObj.pathname.match(/^\/assets\/(.+)$/)) ||
      [];

    if (!assetPath && urlObj && urlObj.query && urlObj.query.unstable_path) {
      const [, actualPath, secondaryQuery] = nullthrows(
        urlObj.query.unstable_path.match(/^([^?]*)\??(.*)$/),
      );
      if (secondaryQuery) {
        Object.assign(urlObj.query, querystring.parse(secondaryQuery));
      }
      assetPath = actualPath;
    }

    if (!assetPath) {
      throw new Error('Could not extract asset path from URL');
    }

    const processingAssetRequestLogEntry = log(
      createActionStartEntry({
        action_name: 'Processing asset request',
        asset: assetPath[1],
      }),
    );

    try {
      const data = await getAsset(
        assetPath,
        this._config.projectRoot,
        this._config.watchFolders,
        urlObj.query.platform,
        this._config.resolver.assetExts,
      );
      // Tell clients to cache this for 1 year.
      // This is safe as the asset url contains a hash of the asset.
      if (process.env.REACT_NATIVE_ENABLE_ASSET_CACHING === true) {
        res.setHeader('Cache-Control', 'max-age=31536000');
      }
      res.setHeader('Content-Type', mime.lookup(path.basename(assetPath)));
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

  processRequest: (
    IncomingMessage,
    ServerResponse,
    ((e: ?Error) => void),
  ) => void = (
    req: IncomingMessage,
    res: ServerResponse,
    next: (?Error) => void,
  ) => {
    this._processRequest(req, res, next).catch(next);
  };

  _parseOptions(url: string): BundleOptions {
    return parseOptionsFromUrl(url, new Set(this._config.resolver.platforms));
  }

  _rewriteAndNormalizeUrl(requestUrl: string): string {
    return jscSafeUrl.toNormalUrl(
      this._config.server.rewriteRequestUrl(jscSafeUrl.toNormalUrl(requestUrl)),
    );
  }

  async _processRequest(
    req: IncomingMessage,
    res: ServerResponse,
    next: (?Error) => void,
  ) {
    const originalUrl = req.url;
    req.url = this._rewriteAndNormalizeUrl(req.url);
    const urlObj = url.parse(req.url, true);
    const {host} = req.headers;
    debug(
      `Handling request: ${host ? 'http://' + host : ''}${req.url}` +
        (originalUrl !== req.url ? ` (rewritten from ${originalUrl})` : ''),
    );
    const formattedUrl = url.format({
      ...urlObj,
      host,
      protocol: 'http',
    });
    const pathname = urlObj.pathname || '';
    const buildNumber = this.getNewBuildNumber();
    if (pathname.endsWith('.bundle')) {
      const options = this._parseOptions(formattedUrl);
      await this._processBundleRequest(req, res, options, {
        buildNumber,
        bundlePerfLogger:
          this._config.unstable_perfLoggerFactory?.('BUNDLING_REQUEST', {
            key: buildNumber,
          }) ?? noopLogger,
      });

      if (this._serverOptions && this._serverOptions.onBundleBuilt) {
        this._serverOptions.onBundleBuilt(pathname);
      }
    } else if (pathname.endsWith('.map')) {
      // Chrome dev tools may need to access the source maps.
      res.setHeader('Access-Control-Allow-Origin', 'devtools://devtools');
      await this._processSourceMapRequest(
        req,
        res,
        this._parseOptions(formattedUrl),
        {
          buildNumber,
          bundlePerfLogger: noopLogger,
        },
      );
    } else if (pathname.endsWith('.assets')) {
      await this._processAssetsRequest(
        req,
        res,
        this._parseOptions(formattedUrl),
        {
          buildNumber,
          bundlePerfLogger: noopLogger,
        },
      );
    } else if (pathname.startsWith('/assets/') || pathname === '/assets') {
      await this._processSingleAssetRequest(req, res);
    } else if (pathname === '/symbolicate') {
      await this._symbolicate(req, res);
    } else {
      next();
    }
  }

  _createRequestProcessor<T>({
    createStartEntry,
    createEndEntry,
    build,
    delete: deleteFn,
    finish,
  }: {
    +createStartEntry: (context: ProcessStartContext) => ActionLogEntryData,
    +createEndEntry: (
      context: ProcessEndContext<T>,
    ) => $Rest<ActionStartLogEntry, LogEntry>,
    +build: (context: ProcessStartContext) => Promise<T>,
    +delete?: (context: ProcessDeleteContext) => Promise<void>,
    +finish: (context: ProcessEndContext<T>) => void,
  }): (
    req: IncomingMessage,
    res: ServerResponse,
    bundleOptions: BundleOptions,
    buildContext: $ReadOnly<{
      buildNumber: number,
      bundlePerfLogger: RootPerfLogger,
    }>,
  ) => Promise<void> {
    return async function requestProcessor(
      this: Server,
      req: IncomingMessage,
      res: ServerResponse,
      bundleOptions: BundleOptions,
      buildContext: $ReadOnly<{
        buildNumber: number,
        bundlePerfLogger: RootPerfLogger,
      }>,
    ): Promise<void> {
      const requestStartTimestamp = performance.timeOrigin + performance.now();
      const {buildNumber} = buildContext;
      const {
        entryFile,
        graphOptions,
        resolverOptions,
        serializerOptions,
        transformOptions,
      } = splitBundleOptions(bundleOptions);

      /**
       * `entryFile` is relative to projectRoot, we need to use resolution function
       * to find the appropriate file with supported extensions.
       */
      const resolvedEntryFilePath = await this._resolveRelativePath(entryFile, {
        relativeTo: 'server',
        resolverOptions,
        transformOptions,
      });
      const graphId = getGraphId(resolvedEntryFilePath, transformOptions, {
        unstable_allowRequireContext:
          this._config.transformer.unstable_allowRequireContext,
        resolverOptions,
        shallow: graphOptions.shallow,
        lazy: graphOptions.lazy,
      });

      // For resources that support deletion, handle the DELETE method.
      if (deleteFn && req.method === 'DELETE') {
        const deleteContext = {
          graphId,
          req,
          res,
        };
        try {
          await deleteFn(deleteContext);
        } catch (error) {
          const formattedError = formatBundlingError(error);

          const status = error instanceof ResourceNotFoundError ? 404 : 500;
          res.writeHead(status, {
            'Content-Type': 'application/json; charset=UTF-8',
          });
          res.end(JSON.stringify(formattedError));
        }
        return;
      }

      const mres = MultipartResponse.wrapIfSupported(req, res);

      let onProgress = null;
      let lastProgress = -1;
      if (this._config.reporter) {
        onProgress = (transformedFileCount: number, totalFileCount: number) => {
          const currentProgress = parseInt(
            (transformedFileCount / totalFileCount) * 100,
            10,
          );

          // We want to throttle the updates so that we only show meaningful
          // UI updates slow enough for the client to actually handle them. For
          // that, we check the percentage, and only send percentages that are
          // actually different and that have increased from the last one we sent.
          if (currentProgress > lastProgress || totalFileCount < 10) {
            if (mres instanceof MultipartResponse) {
              mres.writeChunk(
                {'Content-Type': 'application/json'},
                JSON.stringify({
                  done: transformedFileCount,
                  total: totalFileCount,
                }),
              );
            }

            // The `uncork` called internally in Node via `promise.nextTick()` may not fire
            // until all of the Promises are resolved because the microtask queue we're
            // in could be starving the event loop. This can cause a bug where the progress
            // is not actually sent in the response until after bundling is complete. This
            // would defeat the purpose of sending progress, so we `uncork` the stream now
            // which will force the response to flush to the client immediately.
            // $FlowFixMe[method-unbinding] added when improving typing for this parameters
            if (res.socket != null && res.socket.uncork != null) {
              res.socket.uncork();
            }

            lastProgress = currentProgress;
          }

          this._reporter.update({
            buildID: getBuildID(buildNumber),
            type: 'bundle_transform_progressed',
            transformedFileCount,
            totalFileCount,
          });
        };
      }

      this._reporter.update({
        buildID: getBuildID(buildNumber),
        bundleDetails: {
          bundleType: bundleOptions.bundleType,
          dev: transformOptions.dev,
          entryFile: resolvedEntryFilePath,
          minify: transformOptions.minify,
          platform: transformOptions.platform,
        },
        isPrefetch: req.method === 'HEAD',
        type: 'bundle_build_started',
      });

      const startContext = {
        buildNumber,
        bundleOptions,
        entryFile: resolvedEntryFilePath,
        graphId,
        graphOptions,
        mres,
        onProgress,
        req,
        resolverOptions,
        serializerOptions,
        transformOptions,
        bundlePerfLogger: buildContext.bundlePerfLogger,
        requestStartTimestamp,
      };
      const logEntry = log(
        createActionStartEntry(createStartEntry(startContext)),
      );

      let result;
      try {
        result = await build(startContext);
      } catch (error) {
        const formattedError = formatBundlingError(error);

        const status = error instanceof ResourceNotFoundError ? 404 : 500;
        mres.writeHead(status, {
          'Content-Type': 'application/json; charset=UTF-8',
        });
        mres.end(JSON.stringify(formattedError));

        this._reporter.update({
          buildID: getBuildID(buildNumber),
          type: 'bundle_build_failed',
          bundleOptions,
        });

        this._reporter.update({error, type: 'bundling_error'});

        log({
          action_name: 'bundling_error',
          error_type: formattedError.type,
          log_entry_label: 'bundling_error',
          bundle_id: graphId,
          build_id: getBuildID(buildNumber),
          stack: formattedError.message,
        });

        debug('Bundling error', error);

        buildContext.bundlePerfLogger.end('FAIL');

        return;
      }

      const endContext = {
        ...startContext,
        result,
      };
      finish(endContext);

      this._reporter.update({
        buildID: getBuildID(buildNumber),
        type: 'bundle_build_done',
      });

      log(
        /* $FlowFixMe(>=0.122.0 site=react_native_fb) This comment suppresses
         * an error found when Flow v0.122.0 was deployed. To see the error,
         * delete this comment and run Flow. */
        createActionEndEntry({
          ...logEntry,
          ...createEndEntry(endContext),
        }),
      );
    };
  }

  _processBundleRequest: (
    req: IncomingMessage,
    res: ServerResponse,
    bundleOptions: BundleOptions,
    buildContext: $ReadOnly<{
      buildNumber: number,
      bundlePerfLogger: RootPerfLogger,
    }>,
  ) => Promise<void> = this._createRequestProcessor({
    createStartEntry(context: ProcessStartContext) {
      return {
        action_name: 'Requesting bundle',
        bundle_url: context.req.url,
        entry_point: context.entryFile,
        bundler: 'delta',
        build_id: getBuildID(context.buildNumber),
        bundle_options: context.bundleOptions,
        bundle_hash: context.graphId,
        user_agent: context.req.headers['user-agent'] ?? 'unknown',
      };
    },
    createEndEntry(
      context: ProcessEndContext<{
        bundle: string,
        lastModifiedDate: Date,
        nextRevId: RevisionId,
        numModifiedFiles: number,
      }>,
    ) {
      return {
        outdated_modules: context.result.numModifiedFiles,
      };
    },
    build: async ({
      entryFile,
      graphId,
      graphOptions,
      onProgress,
      resolverOptions,
      serializerOptions,
      transformOptions,
      bundlePerfLogger,
      requestStartTimestamp,
    }) => {
      bundlePerfLogger.start({
        timestamp: requestStartTimestamp,
      });
      bundlePerfLogger.annotate({
        string: {
          bundle_url: entryFile,
        },
      });
      const revPromise = this._bundler.getRevisionByGraphId(graphId);

      bundlePerfLogger.point('resolvingAndTransformingDependencies_start');
      bundlePerfLogger.annotate({
        bool: {
          initial_build: revPromise == null,
        },
      });
      const {delta, revision} = await (revPromise != null
        ? this._bundler.updateGraph(await revPromise, false)
        : this._bundler.initializeGraph(
            entryFile,
            transformOptions,
            resolverOptions,
            {
              onProgress,
              shallow: graphOptions.shallow,
              lazy: graphOptions.lazy,
            },
          ));

      bundlePerfLogger.annotate({
        int: {
          graph_node_count: revision.graph.dependencies.size,
        },
      });

      bundlePerfLogger.point('resolvingAndTransformingDependencies_end');
      bundlePerfLogger.point('serializingBundle_start');
      const serializer =
        this._config.serializer.customSerializer ||
        ((entryPoint, preModules, graph, options) =>
          bundleToString(baseJSBundle(entryPoint, preModules, graph, options))
            .code);

      const bundle = await serializer(
        entryFile,
        revision.prepend,
        revision.graph,
        {
          asyncRequireModulePath: await this._resolveRelativePath(
            this._config.transformer.asyncRequireModulePath,
            {
              relativeTo: 'project',
              resolverOptions,
              transformOptions,
            },
          ),
          processModuleFilter: this._config.serializer.processModuleFilter,
          createModuleId: this._createModuleId,
          getRunModuleStatement: this._config.serializer.getRunModuleStatement,
          includeAsyncPaths: graphOptions.lazy,
          dev: transformOptions.dev,
          projectRoot: this._config.projectRoot,
          modulesOnly: serializerOptions.modulesOnly,
          runBeforeMainModule:
            this._config.serializer.getModulesRunBeforeMainModule(
              path.relative(this._config.projectRoot, entryFile),
            ),
          runModule: serializerOptions.runModule,
          sourceMapUrl: serializerOptions.sourceMapUrl,
          sourceUrl: serializerOptions.sourceUrl,
          inlineSourceMap: serializerOptions.inlineSourceMap,
          serverRoot:
            this._config.server.unstable_serverRoot ?? this._config.projectRoot,
          shouldAddToIgnoreList: (module: Module<>) =>
            this._shouldAddModuleToIgnoreList(module),
        },
      );
      bundlePerfLogger.point('serializingBundle_end');

      const bundleCode = typeof bundle === 'string' ? bundle : bundle.code;

      return {
        numModifiedFiles: delta.reset
          ? delta.added.size + revision.prepend.length
          : delta.added.size + delta.modified.size + delta.deleted.size,
        lastModifiedDate: revision.date,
        nextRevId: revision.id,
        bundle: bundleCode,
      };
    },
    finish({req, mres, serializerOptions, result, bundlePerfLogger}) {
      bundlePerfLogger.annotate({
        int: {
          bundle_length: result.bundle.length,
          bundle_byte_length: Buffer.byteLength(result.bundle),
        },
      });
      mres.once('error', () => {
        bundlePerfLogger.end('FAIL');
      });
      mres.once('finish', () => {
        bundlePerfLogger.end('SUCCESS');
      });
      if (
        // We avoid parsing the dates since the client should never send a more
        // recent date than the one returned by the Delta Bundler (if that's the
        // case it's fine to return the whole bundle).
        req.headers['if-modified-since'] ===
        result.lastModifiedDate.toUTCString()
      ) {
        bundlePerfLogger.annotate({
          string: {
            http_status: '304',
          },
        });
        debug('Responding with 304');
        mres.writeHead(304);
        mres.end();
      } else {
        bundlePerfLogger.annotate({
          string: {
            http_status: '200',
          },
        });
        mres.setHeader(
          FILES_CHANGED_COUNT_HEADER,
          String(result.numModifiedFiles),
        );
        mres.setHeader(DELTA_ID_HEADER, String(result.nextRevId));
        if (serializerOptions?.sourceUrl != null) {
          mres.setHeader('Content-Location', serializerOptions.sourceUrl);
        }
        mres.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        mres.setHeader('Last-Modified', result.lastModifiedDate.toUTCString());
        mres.setHeader(
          'Content-Length',
          String(Buffer.byteLength(result.bundle)),
        );
        mres.end(result.bundle);
      }
    },
    delete: async ({graphId, res}) => {
      await this._bundler.endGraph(graphId);
      res.statusCode = 204;
      res.end();
    },
  });

  // This function ensures that modules in source maps are sorted in the same
  // order as in a plain JS bundle.
  _getSortedModules(graph: ReadOnlyGraph<>): $ReadOnlyArray<Module<>> {
    const modules = [...graph.dependencies.values()];
    // Assign IDs to modules in a consistent order
    for (const module of modules) {
      this._createModuleId(module.path);
    }
    // Sort by IDs
    return modules.sort(
      (a: Module<MixedOutput>, b: Module<MixedOutput>) =>
        this._createModuleId(a.path) - this._createModuleId(b.path),
    );
  }

  _processSourceMapRequest: (
    req: IncomingMessage,
    res: ServerResponse,
    bundleOptions: BundleOptions,
    buildContext: $ReadOnly<{
      buildNumber: number,
      bundlePerfLogger: RootPerfLogger,
    }>,
  ) => Promise<void> = this._createRequestProcessor({
    createStartEntry(context: ProcessStartContext) {
      return {
        action_name: 'Requesting sourcemap',
        bundle_url: context.req.url,
        entry_point: context.entryFile,
        bundler: 'delta',
      };
    },
    createEndEntry(context: ProcessEndContext<string>) {
      return {
        bundler: 'delta',
      };
    },
    build: async ({
      entryFile,
      graphId,
      graphOptions,
      onProgress,
      resolverOptions,
      serializerOptions,
      transformOptions,
    }) => {
      let revision;
      const revPromise = this._bundler.getRevisionByGraphId(graphId);
      if (revPromise == null) {
        ({revision} = await this._bundler.initializeGraph(
          entryFile,
          transformOptions,
          resolverOptions,
          {
            onProgress,
            shallow: graphOptions.shallow,
            lazy: graphOptions.lazy,
          },
        ));
      } else {
        ({revision} = await this._bundler.updateGraph(await revPromise, false));
      }

      let {prepend, graph} = revision;
      if (serializerOptions.modulesOnly) {
        prepend = [];
      }

      return sourceMapString([...prepend, ...this._getSortedModules(graph)], {
        excludeSource: serializerOptions.excludeSource,
        processModuleFilter: this._config.serializer.processModuleFilter,
        shouldAddToIgnoreList: (module: Module<>) =>
          this._shouldAddModuleToIgnoreList(module),
      });
    },
    finish({mres, result}) {
      mres.setHeader('Content-Type', 'application/json');
      mres.end(result.toString());
    },
  });

  _processAssetsRequest: (
    req: IncomingMessage,
    res: ServerResponse,
    bundleOptions: BundleOptions,
    buildContext: $ReadOnly<{
      buildNumber: number,
      bundlePerfLogger: RootPerfLogger,
    }>,
  ) => Promise<void> = this._createRequestProcessor({
    createStartEntry(context: ProcessStartContext) {
      return {
        action_name: 'Requesting assets',
        bundle_url: context.req.url,
        entry_point: context.entryFile,
        bundler: 'delta',
      };
    },
    createEndEntry(context: ProcessEndContext<$ReadOnlyArray<AssetData>>) {
      return {
        bundler: 'delta',
      };
    },
    build: async ({
      entryFile,
      onProgress,
      resolverOptions,
      transformOptions,
    }) => {
      const dependencies = await this._bundler.getDependencies(
        [entryFile],
        transformOptions,
        resolverOptions,
        {onProgress, shallow: false, lazy: false},
      );

      return await getAssets(dependencies, {
        processModuleFilter: this._config.serializer.processModuleFilter,
        assetPlugins: this._config.transformer.assetPlugins,
        platform: transformOptions.platform,
        publicPath: this._config.transformer.publicPath,
        projectRoot: this._config.projectRoot,
      });
    },
    finish({mres, result}) {
      mres.setHeader('Content-Type', 'application/json');
      mres.end(JSON.stringify(result));
    },
  });

  async _symbolicate(req: IncomingMessage, res: ServerResponse) {
    const getCodeFrame = (
      urls: Set<string>,
      symbolicatedStack: $ReadOnlyArray<StackFrameOutput>,
    ) => {
      for (let i = 0; i < symbolicatedStack.length; i++) {
        const {collapse, column, file, lineNumber} = symbolicatedStack[i];

        if (
          collapse ||
          lineNumber == null ||
          (file != null && urls.has(file))
        ) {
          continue;
        }

        const fileAbsolute = path.resolve(this._config.projectRoot, file ?? '');
        try {
          return {
            content: codeFrameColumns(
              fs.readFileSync(fileAbsolute, 'utf8'),
              {
                // Metro returns 0 based columns but codeFrameColumns expects 1-based columns
                // $FlowFixMe[unsafe-addition]
                start: {column: column + 1, line: lineNumber},
              },
              {forceColor: true},
            ),
            location: {
              row: lineNumber,
              column,
            },
            fileName: file,
          };
        } catch (error) {
          console.error(error);
        }
      }

      return null;
    };

    try {
      const symbolicatingLogEntry = log(
        createActionStartEntry('Symbolicating'),
      );
      debug('Start symbolication');
      /* $FlowFixMe: where is `rawBody` defined? Is it added by the `connect` framework? */
      const body = await req.rawBody;
      const parsedBody = JSON.parse(body);

      const rewriteAndNormalizeStackFrame = <T>(
        frame: T,
        lineNumber: number,
      ): T => {
        invariant(
          frame != null && typeof frame === 'object',
          'Bad stack frame at line %d, expected object, received: %s',
          lineNumber,
          typeof frame,
        );
        const frameFile = frame.file;
        if (typeof frameFile === 'string' && frameFile.includes('://')) {
          return {
            ...frame,
            file: this._rewriteAndNormalizeUrl(frameFile),
          };
        }
        return frame;
      };

      const stack = parsedBody.stack.map(rewriteAndNormalizeStackFrame);
      // In case of multiple bundles / HMR, some stack frames can have different URLs from others
      const urls = new Set<string>();

      stack.forEach(frame => {
        // These urls have been rewritten and normalized above.
        const sourceUrl = frame.file;
        // Skip `/debuggerWorker.js` which does not need symbolication.
        if (
          sourceUrl != null &&
          !urls.has(sourceUrl) &&
          !sourceUrl.endsWith('/debuggerWorker.js') &&
          sourceUrl.startsWith('http')
        ) {
          urls.add(sourceUrl);
        }
      });

      debug('Getting source maps for symbolication');
      const sourceMaps = await Promise.all(
        Array.from(urls.values()).map(normalizedUrl =>
          this._explodedSourceMapForBundleOptions(
            this._parseOptions(normalizedUrl),
          ),
        ),
      );

      debug('Performing fast symbolication');
      const symbolicatedStack = await symbolicate(
        stack,
        zip(urls.values(), sourceMaps),
        this._config,
        parsedBody.extraData ?? {},
      );

      debug('Symbolication done');
      res.end(
        JSON.stringify({
          codeFrame: getCodeFrame(urls, symbolicatedStack),
          stack: symbolicatedStack,
        }),
      );
      process.nextTick(() => {
        log(createActionEndEntry(symbolicatingLogEntry));
      });
    } catch (error) {
      console.error(error.stack || error);
      res.statusCode = 500;
      res.end(JSON.stringify({error: error.message}));
    }
  }

  async _explodedSourceMapForBundleOptions(
    bundleOptions: BundleOptions,
  ): Promise<ExplodedSourceMap> {
    const {
      entryFile,
      graphOptions,
      onProgress,
      resolverOptions,
      serializerOptions,
      transformOptions,
    } = splitBundleOptions(bundleOptions);

    /**
     * `entryFile` is relative to projectRoot, we need to use resolution function
     * to find the appropriate file with supported extensions.
     */
    const resolvedEntryFilePath = await this._resolveRelativePath(entryFile, {
      relativeTo: 'server',
      resolverOptions,
      transformOptions,
    });

    const graphId = getGraphId(resolvedEntryFilePath, transformOptions, {
      unstable_allowRequireContext:
        this._config.transformer.unstable_allowRequireContext,
      resolverOptions,
      shallow: graphOptions.shallow,
      lazy: graphOptions.lazy,
    });
    let revision;
    const revPromise = this._bundler.getRevisionByGraphId(graphId);
    if (revPromise == null) {
      ({revision} = await this._bundler.initializeGraph(
        resolvedEntryFilePath,
        transformOptions,
        resolverOptions,
        {
          onProgress,
          shallow: graphOptions.shallow,
          lazy: graphOptions.lazy,
        },
      ));
    } else {
      ({revision} = await this._bundler.updateGraph(await revPromise, false));
    }

    let {prepend, graph} = revision;
    if (serializerOptions.modulesOnly) {
      prepend = [];
    }

    return getExplodedSourceMap(
      [...prepend, ...this._getSortedModules(graph)],
      {
        processModuleFilter: this._config.serializer.processModuleFilter,
      },
    );
  }

  async _resolveRelativePath(
    filePath: string,
    {
      relativeTo,
      resolverOptions,
      transformOptions,
    }: $ReadOnly<{
      relativeTo: 'project' | 'server',
      resolverOptions: ResolverInputOptions,
      transformOptions: TransformInputOptions,
    }>,
  ): Promise<string> {
    const resolutionFn = await transformHelpers.getResolveDependencyFn(
      this._bundler.getBundler(),
      transformOptions.platform,
      resolverOptions,
    );
    const rootDir =
      relativeTo === 'server'
        ? this._getServerRootDir()
        : this._config.projectRoot;
    return resolutionFn(`${rootDir}/.`, {
      name: filePath,
      data: {key: filePath, locs: [], asyncType: null},
    }).filePath;
  }

  getNewBuildNumber(): number {
    return this._nextBundleBuildNumber++;
  }

  getPlatforms(): $ReadOnlyArray<string> {
    return this._config.resolver.platforms;
  }

  getWatchFolders(): $ReadOnlyArray<string> {
    return this._config.watchFolders;
  }

  static DEFAULT_GRAPH_OPTIONS: $ReadOnly<{
    customResolverOptions: CustomResolverOptions,
    customTransformOptions: CustomTransformOptions,
    dev: boolean,
    hot: boolean,
    minify: boolean,
    unstable_transformProfile: 'default',
  }> = {
    customResolverOptions: Object.create(null),
    customTransformOptions: Object.create(null),
    dev: true,
    hot: false,
    minify: false,
    unstable_transformProfile: 'default',
  };

  static DEFAULT_BUNDLE_OPTIONS: {
    ...typeof Server.DEFAULT_GRAPH_OPTIONS,
    excludeSource: false,
    inlineSourceMap: false,
    lazy: false,
    modulesOnly: false,
    onProgress: null,
    runModule: true,
    shallow: false,
    sourceMapUrl: null,
    sourceUrl: null,
  } = {
    ...Server.DEFAULT_GRAPH_OPTIONS,
    excludeSource: false,
    inlineSourceMap: false,
    lazy: false,
    modulesOnly: false,
    onProgress: null,
    runModule: true,
    shallow: false,
    sourceMapUrl: null,
    sourceUrl: null,
  };

  _getServerRootDir(): string {
    return this._config.server.unstable_serverRoot ?? this._config.projectRoot;
  }

  _getEntryPointAbsolutePath(entryFile: string): string {
    return path.resolve(this._getServerRootDir(), entryFile);
  }

  // Wait for the server to finish initializing.
  async ready(): Promise<void> {
    await this._bundler.ready();
  }

  _shouldAddModuleToIgnoreList(module: Module<>): boolean {
    // TODO: Add flag to Module signifying whether it represents generated code
    // and clean up these heuristics.
    return (
      // Prelude code, see getPrependedScripts.js
      module.path === '__prelude__' ||
      // Generated require.context() module, see contextModule.js
      module.path.includes('?ctx=') ||
      this._config.serializer.isThirdPartyModule(module)
    );
  }
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

function getBuildID(buildNumber: number): string {
  return buildNumber.toString(36);
}

module.exports = Server;
