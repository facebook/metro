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
const MetroHmrServer = require('./HmrServer');
const MetroServer = require('./Server');

const attachWebsocketServer = require('./lib/attachWebsocketServer');
const chalk = require('chalk');
const fs = require('fs');
const http = require('http');
const https = require('https');
const makeBuildCommand = require('./commands/build');
const makeDependenciesCommand = require('./commands/dependencies');
const makeServeCommand = require('./commands/serve');
const outputBundle = require('./shared/output/bundle');

const {loadConfig, mergeConfig, getDefaultConfig} = require('metro-config');
const {InspectorProxy} = require('metro-inspector-proxy');

import type {Graph} from './DeltaBundler';
import type {ServerOptions} from './Server';
import type {RequestOptions, OutputOptions} from './shared/types.flow.js';
import type {Server as HttpServer} from 'http';
import type {Server as HttpsServer} from 'https';
import type {
  ConfigT,
  InputConfigT,
  Middleware,
} from 'metro-config/src/configTypes.flow';
import type {CustomTransformOptions} from 'metro-transform-worker';
import typeof Yargs from 'yargs';

type MetroMiddleWare = {|
  attachHmrServer: (httpServer: HttpServer | HttpsServer) => void,
  end: () => void,
  metroServer: MetroServer,
  middleware: Middleware,
|};

export type RunServerOptions = {|
  hasReducedPerformance?: boolean,
  host?: string,
  onError?: (Error & {|code?: string|}) => void,
  onReady?: (server: HttpServer | HttpsServer) => void,
  runInspectorProxy?: boolean,
  secureServerOptions?: Object,
  secure?: boolean, // deprecated
  secureCert?: string, // deprecated
  secureKey?: string, // deprecated
|};

type BuildGraphOptions = {|
  entries: $ReadOnlyArray<string>,
  customTransformOptions?: CustomTransformOptions,
  dev?: boolean,
  minify?: boolean,
  onProgress?: (transformedFileCount: number, totalFileCount: number) => void,
  platform?: string,
  type?: 'module' | 'script',
|};

export type RunBuildOptions = {|
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
    ) => Promise<{
      code: string,
      map: string,
      ...
    }>,
    save: (
      {
        code: string,
        map: string,
        ...
      },
      OutputOptions,
      (...args: Array<string>) => void,
    ) => Promise<mixed>,
    ...
  },
  platform?: string,
  sourceMap?: boolean,
  sourceMapUrl?: string,
|};

type BuildCommandOptions = {||} | null;
type ServeCommandOptions = {||} | null;

async function getConfig(config: InputConfigT): Promise<ConfigT> {
  const defaultConfig = await getDefaultConfig(config.projectRoot);
  return mergeConfig(defaultConfig, config);
}

async function runMetro(
  config: InputConfigT,
  options?: ServerOptions,
): Promise<MetroServer> {
  const mergedConfig = await getConfig(config);

  mergedConfig.reporter.update({
    hasReducedPerformance: options
      ? Boolean(options.hasReducedPerformance)
      : false,
    port: mergedConfig.server.port,
    type: 'initialize_started',
  });

  return new MetroServer(mergedConfig, options);
}

exports.runMetro = runMetro;
exports.loadConfig = loadConfig;

exports.createConnectMiddleware = async function(
  config: ConfigT,
  options?: ServerOptions,
): Promise<MetroMiddleWare> {
  const metroServer = await runMetro(config, options);

  let enhancedMiddleware = metroServer.processRequest;

  // Enhance the resulting middleware using the config options
  if (config.server.enhanceMiddleware) {
    enhancedMiddleware = config.server.enhanceMiddleware(
      enhancedMiddleware,
      metroServer,
    );
  }

  return {
    attachHmrServer(httpServer: HttpServer | HttpsServer): void {
      attachWebsocketServer({
        httpServer,
        path: '/hot',
        websocketServer: new MetroHmrServer(
          metroServer.getBundler(),
          metroServer.getCreateModuleId(),
          config,
        ),
      });
    },
    metroServer,
    middleware: enhancedMiddleware,
    end(): void {
      metroServer.end();
    },
  };
};

exports.runServer = async (
  config: ConfigT,
  {
    hasReducedPerformance = false,
    host,
    onError,
    onReady,
    secureServerOptions,
    secure, //deprecated
    secureCert, // deprecated
    secureKey, // deprecated
  }: RunServerOptions,
): Promise<HttpServer | HttpsServer> => {
  if (secure != null || secureCert != null || secureKey != null) {
    // eslint-disable-next-line no-console
    console.warn(
      chalk.inverse.yellow.bold(' DEPRECATED '),
      'The `secure`, `secureCert`, and `secureKey` options are now deprecated. ' +
        'Please use the `secureServerOptions` object instead to pass options to ' +
        "Metro's https development server.",
    );
  }
  // Lazy require
  const connect = require('connect');

  const serverApp = connect();

  const {
    attachHmrServer,
    middleware,
    end,
  } = await exports.createConnectMiddleware(config, {
    hasReducedPerformance,
  });

  serverApp.use(middleware);

  let inspectorProxy: ?InspectorProxy = null;
  if (config.server.runInspectorProxy) {
    inspectorProxy = new InspectorProxy(config.projectRoot);
  }

  let httpServer;

  if (secure || secureServerOptions != null) {
    let options = secureServerOptions;
    if (typeof secureKey === 'string' && typeof secureCert === 'string') {
      options = Object.assign(
        {
          key: fs.readFileSync(secureKey),
          cert: fs.readFileSync(secureCert),
        },
        secureServerOptions,
      );
    }
    httpServer = https.createServer(options, serverApp);
  } else {
    httpServer = http.createServer(serverApp);
  }

  httpServer.on('error', error => {
    if (onError) {
      onError(error);
    }
    end();
  });

  return new Promise(
    (
      resolve: (result: HttpServer | HttpsServer) => void,
      reject: mixed => mixed,
    ) => {
      httpServer.listen(config.server.port, host, () => {
        if (onReady) {
          onReady(httpServer);
        }

        attachHmrServer(httpServer);
        if (inspectorProxy) {
          inspectorProxy.addWebSocketListener(httpServer);

          // TODO(hypuk): Refactor inspectorProxy.processRequest into separate request handlers
          // so that we could provide routes (/json/list and /json/version) here.
          // Currently this causes Metro to give warning about T31407894.
          serverApp.use(inspectorProxy.processRequest.bind(inspectorProxy));
        }

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
    },
  );
};

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
): Promise<{
  code: string,
  map: string,
  ...
}> => {
  const metroServer = await runMetro(config, {
    watch: false,
  });

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
  const mergedConfig = await getConfig(config);

  const bundler = new IncrementalBundler(mergedConfig);

  try {
    return await bundler.buildGraphForEntries(entries, {
      ...MetroServer.DEFAULT_GRAPH_OPTIONS,
      customTransformOptions,
      dev,
      minify,
      platform,
      type,
    });
  } finally {
    bundler.end();
  }
};

exports.attachMetroCli = function(
  // $FlowFixMe[value-as-type]
  yargs: Yargs,
  {
    build = {},
    serve = {},
    dependencies = {},
  }: {
    build: BuildCommandOptions,
    serve: ServeCommandOptions,
    dependencies: any,
    ...
  } = {},
  // $FlowFixMe[value-as-type]
): Yargs {
  if (build) {
    const {command, description, builder, handler} = makeBuildCommand();
    yargs.command(command, description, builder, handler);
  }
  if (serve) {
    const {command, description, builder, handler} = makeServeCommand();
    yargs.command(command, description, builder, handler);
  }
  if (dependencies) {
    const {command, description, builder, handler} = makeDependenciesCommand();
    yargs.command(command, description, builder, handler);
  }
  return yargs;
};
