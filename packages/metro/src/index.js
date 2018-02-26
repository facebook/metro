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

const Config = require('./Config');
const MetroHmrServer = require('./HmrServer');
const MetroServer = require('./Server');
const TerminalReporter = require('./lib/TerminalReporter');
const TransformCaching = require('./lib/TransformCaching');

const attachWebsocketServer = require('./lib/attachWebsocketServer');
const defaults = require('./defaults');
const fs = require('fs');
const getMaxWorkers = require('./lib/getMaxWorkers');
const http = require('http');
const https = require('https');
const makeBuildCommand = require('./commands/build');
const makeServeCommand = require('./commands/serve');
const outputBundle = require('./shared/output/bundle');
const path = require('path');

const {realpath} = require('fs');
const {readFile} = require('fs-extra');
const {Terminal} = require('metro-core');

import type {ConfigT} from './Config';
import type {GlobalTransformCache} from './lib/GlobalTransformCache';
import type {TransformCache} from './lib/TransformCaching';
import type {Reporter} from './lib/reporting';
import type {RequestOptions, OutputOptions} from './shared/types.flow.js';
import type {Options as ServerOptions} from './shared/types.flow';
import type {Server as HttpServer} from 'http';
import type {Server as HttpsServer} from 'https';
import typeof Yargs from 'yargs';

export type {ConfigT} from './Config';

type DeprecatedMetroOptions = {|
  resetCache?: boolean,
|};

type PublicMetroOptions = {|
  ...DeprecatedMetroOptions,
  config?: ConfigT,
  globalTransformCache?: ?GlobalTransformCache,
  maxWorkers?: number,
  minifierPath?: string,
  port?: ?number,
  reporter?: Reporter,
  transformCache?: TransformCache,
|};

type PrivateMetroOptions = {|
  ...PublicMetroOptions,
  watch?: boolean,
|};

// We'll be able to remove this to use the one provided by modern versions of
// fs-extra once https://github.com/jprichardson/node-fs-extra/pull/520 will
// have been merged (until then, they'll break on devservers/Sandcastle)
async function asyncRealpath(path): Promise<string> {
  return new Promise((resolve, reject) => {
    realpath(path, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

async function runMetro({
  config,
  globalTransformCache,
  resetCache = false,
  maxWorkers = getMaxWorkers(),
  minifierPath,
  // $FlowFixMe TODO t0 https://github.com/facebook/flow/issues/183
  port = null,
  reporter = new TerminalReporter(new Terminal(process.stdout)),
  transformCache = TransformCaching.useTempDir(),
  watch = false,
}: PrivateMetroOptions): Promise<MetroServer> {
  const normalizedConfig = config ? Config.normalize(config) : Config.DEFAULT;

  const assetExts = defaults.assetExts.concat(
    (normalizedConfig.getAssetExts && normalizedConfig.getAssetExts()) || [],
  );
  const sourceExts = defaults.sourceExts.concat(
    (normalizedConfig.getSourceExts && normalizedConfig.getSourceExts()) || [],
  );
  const platforms =
    (normalizedConfig.getPlatforms && normalizedConfig.getPlatforms()) || [];

  const providesModuleNodeModules =
    typeof normalizedConfig.getProvidesModuleNodeModules === 'function'
      ? normalizedConfig.getProvidesModuleNodeModules()
      : defaults.providesModuleNodeModules;

  const finalProjectRoots = await Promise.all(
    normalizedConfig.getProjectRoots().map(path => asyncRealpath(path)),
  );

  reporter.update({
    type: 'initialize_started',
    port,
    projectRoots: finalProjectRoots,
  });
  const serverOptions: ServerOptions = {
    assetExts: normalizedConfig.assetTransforms ? [] : assetExts,
    assetRegistryPath: normalizedConfig.assetRegistryPath,
    blacklistRE: normalizedConfig.getBlacklistRE(),
    cacheStores: normalizedConfig.cacheStores,
    cacheVersion: normalizedConfig.cacheVersion,
    createModuleIdFactory: normalizedConfig.createModuleIdFactory,
    dynamicDepsInPackages: normalizedConfig.dynamicDepsInPackages,
    enableBabelRCLookup: normalizedConfig.getEnableBabelRCLookup(),
    extraNodeModules: normalizedConfig.extraNodeModules,
    getPolyfills: normalizedConfig.getPolyfills,
    getModulesRunBeforeMainModule:
      normalizedConfig.getModulesRunBeforeMainModule,
    getTransformOptions: normalizedConfig.getTransformOptions,
    globalTransformCache,
    hasteImplModulePath: normalizedConfig.hasteImplModulePath,
    maxWorkers,
    minifierPath,
    platforms: defaults.platforms.concat(platforms),
    postMinifyProcess: normalizedConfig.postMinifyProcess,
    postProcessModules: normalizedConfig.postProcessModules,
    postProcessBundleSourcemap: normalizedConfig.postProcessBundleSourcemap,
    providesModuleNodeModules,
    resetCache,
    reporter,
    sourceExts: normalizedConfig.assetTransforms
      ? sourceExts.concat(assetExts)
      : sourceExts,
    transformCache,
    transformModulePath: normalizedConfig.getTransformModulePath(),
    watch,
    workerPath:
      normalizedConfig.getWorkerPath && normalizedConfig.getWorkerPath(),
    projectRoots: finalProjectRoots,
  };

  return new MetroServer(serverOptions);
}

type CreateConnectMiddlewareOptions = {|
  ...PublicMetroOptions,
|};

exports.createConnectMiddleware = async function({
  config,
  ...rest
}: CreateConnectMiddlewareOptions) {
  // $FlowFixMe Flow doesn't support object spread enough for the following line
  const metroServer = await runMetro({
    ...rest,
    config,
    watch: true,
  });

  const normalizedConfig = config ? Config.normalize(config) : Config.DEFAULT;

  let enhancedMiddleware = metroServer.processRequest;

  // Enhance the resulting middleware using the config options
  if (normalizedConfig.enhanceMiddleware) {
    enhancedMiddleware = normalizedConfig.enhanceMiddleware(enhancedMiddleware);
  }

  return {
    attachHmrServer(httpServer: HttpServer | HttpsServer) {
      attachWebsocketServer({
        httpServer,
        path: '/hot',
        websocketServer: new MetroHmrServer(metroServer),
      });
    },
    metroServer,
    middleware: enhancedMiddleware,
    end() {
      metroServer.end();
    },
  };
};

type RunServerOptions = {|
  ...PublicMetroOptions,
  host?: string,
  onReady?: (server: HttpServer | HttpsServer) => void,
  port?: number,
  secure?: boolean,
  secureKey?: string,
  secureCert?: string,
  hmrEnabled?: boolean,
|};

exports.runServer = async ({
  host,
  onReady,
  minifierPath,
  // $FlowFixMe Flow messes up when using "destructuring"+"default value"+"spread typing"+"stricter field typing" together
  port = 8080,
  reporter = new TerminalReporter(new Terminal(process.stdout)),
  secure = false,
  secureKey,
  secureCert,
  hmrEnabled = false,
  ...rest
}: RunServerOptions) => {
  // Lazy require
  const connect = require('connect');

  const serverApp = connect();

  const {
    attachHmrServer,
    middleware,
    end,
    // $FlowFixMe Flow doesn't support object spread enough for the following line
  } = await exports.createConnectMiddleware({
    ...rest,
    port,
    reporter,
    minifierPath,
  });

  serverApp.use(middleware);

  let httpServer;

  if (secure) {
    httpServer = https.createServer(
      {
        key: await readFile(secureKey),
        cert: await readFile(secureCert),
      },
      serverApp,
    );
  } else {
    httpServer = http.createServer(serverApp);
  }

  if (hmrEnabled) {
    attachHmrServer(httpServer);
  }

  httpServer.listen(port, host, () => {
    onReady && onReady(httpServer);
  });

  // Disable any kind of automatic timeout behavior for incoming
  // requests in case it takes the packager more than the default
  // timeout of 120 seconds to respond to a request.
  httpServer.timeout = 0;

  httpServer.on('error', error => {
    end();
  });

  httpServer.on('close', () => {
    end();
  });

  return httpServer;
};

type RunBuildOptions = {|
  ...PublicMetroOptions,
  entry: string,
  out: string,
  dev?: boolean,
  onBegin?: () => void,
  onProgress?: (transformedFileCount: number, totalFileCount: number) => void,
  onComplete?: () => void,
  optimize?: boolean,
  output?: {
    build: (
      MetroServer,
      RequestOptions,
    ) => Promise<{code: string, map: string}>,
    save: (
      {code: string, map: string},
      OutputOptions,
      (...args: Array<string>) => void,
    ) => Promise<mixed>,
  },
  platform?: string,
  sourceMap?: boolean,
  sourceMapUrl?: string,
|};

exports.runBuild = async ({
  config,
  dev = false,
  entry,
  onBegin,
  onComplete,
  onProgress,
  optimize = false,
  output = outputBundle,
  out,
  platform = `web`,
  sourceMap = false,
  sourceMapUrl,
  ...rest
}: RunBuildOptions) => {
  // $FlowFixMe Flow doesn't support object spread enough for the following line
  const metroServer = await runMetro({
    ...rest,
    config,
  });

  const requestOptions: RequestOptions = {
    dev,
    entryFile: entry,
    inlineSourceMap: sourceMap && !!sourceMapUrl,
    minify: optimize,
    platform,
    sourceMapUrl: sourceMap === false ? undefined : sourceMapUrl,
    createModuleIdFactory: config ? config.createModuleIdFactory : undefined,
    onProgress,
  };

  if (onBegin) {
    onBegin();
  }

  let metroBundle;

  try {
    metroBundle = await output.build(metroServer, requestOptions);
  } catch (error) {
    await metroServer.end();
    throw error;
  }

  if (onComplete) {
    onComplete();
  }

  const bundleOutput = out.replace(/(\.js)?$/, '.js');
  const sourcemapOutput =
    sourceMap === false ? undefined : out.replace(/(\.js)?$/, '.map');

  const outputOptions: OutputOptions = {
    bundleOutput,
    sourcemapOutput,
    dev,
    platform,
  };

  // eslint-disable-next-line no-console
  await output.save(metroBundle, outputOptions, console.log);
  await metroServer.end();

  return {metroServer, metroBundle};
};

type MetroConfigSearchOptions = {|
  cwd?: string,
  basename?: string,
  strict?: boolean,
|};

const METRO_CONFIG_FILENAME = 'metro.config.js';

exports.findMetroConfig = function(
  filename: ?string,
  {
    cwd = process.cwd(),
    basename = METRO_CONFIG_FILENAME,
    strict = false,
  }: MetroConfigSearchOptions = {},
): ?string {
  if (filename) {
    return path.resolve(cwd, filename);
  } else {
    let previous;
    let current = cwd;

    do {
      const filename = path.join(current, basename);

      if (fs.existsSync(filename)) {
        return filename;
      }

      previous = current;
      current = path.dirname(current);
    } while (previous !== current);

    if (strict) {
      throw new Error(`Expected to find a Metro config file, found none`);
    } else {
      return null;
    }
  }
};

exports.loadMetroConfig = function(
  filename: ?string,
  // $FlowFixMe TODO T26072405
  searchOptions: MetroConfigSearchOptions = {},
): ConfigT {
  const location = exports.findMetroConfig(filename, searchOptions);

  // $FlowFixMe: We want this require to be dynamic
  const config = location ? require(location) : null;

  return config ? Config.normalize(config) : Config.DEFAULT;
};

type BuildCommandOptions = {||} | null;
type ServeCommandOptions = {||} | null;

exports.attachMetroCli = function(
  yargs: Yargs,
  {
    // $FlowFixMe TODO T26072405
    build = {},
    // $FlowFixMe TODO T26072405
    serve = {},
  }: {
    build: BuildCommandOptions,
    serve: ServeCommandOptions,
  } = {},
) {
  if (build) {
    const {command, description, builder, handler} = makeBuildCommand();
    yargs.command(command, description, builder, handler);
  }
  if (serve) {
    const {command, description, builder, handler} = makeServeCommand();
    yargs.command(command, description, builder, handler);
  }
  return yargs;
};

exports.Config = Config;
exports.defaults = defaults;

// The symbols below belong to the legacy API and should not be relied upon
Object.assign(exports, require('./legacy'));
