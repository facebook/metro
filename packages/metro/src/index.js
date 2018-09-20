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

const MetroHmrServer = require('./HmrServer');
const MetroServer = require('./Server');

const attachWebsocketServer = require('./lib/attachWebsocketServer');
const http = require('http');
const https = require('https');
const makeBuildCommand = require('./commands/build');
const makeServeCommand = require('./commands/serve');
const outputBundle = require('./shared/output/bundle');

const {readFile} = require('fs-extra');
const {loadConfig, mergeConfig, getDefaultConfig} = require('metro-config');

import type {Graph} from './DeltaBundler';
import type {CustomTransformOptions} from './JSTransformer/worker';
import type {RequestOptions, OutputOptions} from './shared/types.flow.js';
import type {Server as HttpServer} from 'http';
import type {Server as HttpsServer} from 'https';
import type {ConfigT, InputConfigT} from 'metro-config/src/configTypes.flow';
import typeof Yargs from 'yargs';

async function runMetro(config: InputConfigT): Promise<MetroServer> {
  const defaultConfig = await getDefaultConfig(config.projectRoot);
  const mergedConfig = mergeConfig(defaultConfig, config);

  mergedConfig.reporter.update({
    type: 'initialize_started',
    port: mergedConfig.server.port,
    // FIXME: We need to change that to watchFolders. It will be a
    // breaking since it affects custom reporter API.
    projectRoots: mergedConfig.watchFolders,
  });

  return new MetroServer(mergedConfig);
}

exports.runMetro = runMetro;
exports.loadConfig = loadConfig;

exports.createConnectMiddleware = async function(config: ConfigT) {
  const metroServer = await runMetro(config);

  let enhancedMiddleware = metroServer.processRequest;

  // Enhance the resulting middleware using the config options
  if (config.server.enhanceMiddleware) {
    enhancedMiddleware = config.server.enhanceMiddleware(
      enhancedMiddleware,
      metroServer,
    );
  }

  return {
    attachHmrServer(httpServer: HttpServer | HttpsServer) {
      attachWebsocketServer({
        httpServer,
        path: '/hot',
        websocketServer: new MetroHmrServer(metroServer, config),
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
  host?: string,
  onReady?: (server: HttpServer | HttpsServer) => void,
  onError?: (Error & {|code?: string|}) => void,
  secure?: boolean,
  secureKey?: string,
  secureCert?: string,
  hmrEnabled?: boolean,
|};

exports.runServer = async (
  config: ConfigT,
  {
    host,
    onReady,
    onError,
    secure = false,
    secureKey,
    secureCert,
    hmrEnabled = false,
  }: RunServerOptions,
) => {
  // Lazy require
  const connect = require('connect');

  const serverApp = connect();

  const {
    attachHmrServer,
    middleware,
    metroServer,
    end,
  } = await exports.createConnectMiddleware(config);

  serverApp.use(middleware);

  if (config.server.enableVisualizer) {
    let initializeVisualizerMiddleware;
    try {
      // eslint-disable-next-line import/no-extraneous-dependencies
      ({initializeVisualizerMiddleware} = require('metro-visualizer'));
    } catch (e) {
      console.warn(
        "'config.server.enableVisualizer' is enabled but the 'metro-visualizer' package was not found - have you installed it?",
      );
    }
    if (initializeVisualizerMiddleware) {
      serverApp.use('/visualizer', initializeVisualizerMiddleware(metroServer));
    }
  }

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

  httpServer.on('error', error => {
    onError && onError(error);
    end();
  });

  if (hmrEnabled) {
    attachHmrServer(httpServer);
  }

  return new Promise((resolve, reject) => {
    httpServer.listen(config.server.port, host, () => {
      onReady && onReady(httpServer);
      resolve(httpServer);
    });

    // Disable any kind of automatic timeout behavior for incoming
    // requests in case it takes the packager more than the default
    // timeout of 120 seconds to respond to a request.
    httpServer.timeout = 0;

    httpServer.on('error', error => {
      end();
      reject(error);
    });

    httpServer.on('close', () => {
      end();
    });
  });
};

type BuildGraphOptions = {|
  entries: $ReadOnlyArray<string>,
  customTransformOptions?: CustomTransformOptions,
  dev?: boolean,
  minify?: boolean,
  onProgress?: (transformedFileCount: number, totalFileCount: number) => void,
  platform?: string,
  type?: 'module' | 'script',
|};

type RunBuildOptions = {|
  entry: string,
  dev?: boolean,
  out?: string,
  onBegin?: () => void,
  onComplete?: () => void,
  onProgress?: (transformedFileCount: number, totalFileCount: number) => void,
  minify?: boolean,
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

exports.runBuild = async (
  config: ConfigT,
  {
    dev = false,
    entry,
    onBegin,
    onComplete,
    onProgress,
    minify = true,
    output = outputBundle,
    out,
    platform = 'web',
    sourceMap = false,
    sourceMapUrl,
  }: RunBuildOptions,
) => {
  const metroServer = await runMetro(config);

  try {
    const requestOptions: RequestOptions = {
      dev,
      entryFile: entry,
      inlineSourceMap: sourceMap && !sourceMapUrl,
      minify,
      platform,
      sourceMapUrl: sourceMap === false ? undefined : sourceMapUrl,
      createModuleIdFactory: config.serializer.createModuleIdFactory,
      onProgress,
    };

    if (onBegin) {
      onBegin();
    }

    const metroBundle = await output.build(metroServer, requestOptions);

    if (onComplete) {
      onComplete();
    }

    if (out) {
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
    }

    return metroBundle;
  } finally {
    await metroServer.end();
  }
};

exports.buildGraph = async function(
  config: InputConfigT,
  {
    customTransformOptions = Object.create(null),
    dev = false,
    entries,
    minify = false,
    onProgress,
    platform = 'web',
    type = 'module',
  }: BuildGraphOptions,
): Promise<Graph<>> {
  const metroServer = await runMetro(config);

  try {
    return await metroServer.buildGraph(entries, {
      ...MetroServer.DEFAULT_GRAPH_OPTIONS,
      customTransformOptions,
      dev,
      minify,
      onProgress,
      platform,
      type,
    });
  } finally {
    await metroServer.end();
  }
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

// The symbols below belong to the legacy API and should not be relied upon
Object.assign(exports, require('./legacy'));
