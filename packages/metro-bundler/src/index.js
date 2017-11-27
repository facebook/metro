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

const Http = require('http');
const Https = require('https');
const MetroBundler = require('./shared/output/bundle');
const MetroServer = require('./Server');
const Terminal = require('./lib/Terminal');
const TerminalReporter = require('./lib/TerminalReporter');
const TransformCaching = require('./lib/TransformCaching');

const connect = require('connect');

const {realpath} = require('fs');
const {readFile} = require('fs-extra');

const defaultAssetExts = require('./defaults').assetExts;
const defaultSourceExts = require('./defaults').sourceExts;
const defaultPlatforms = require('./defaults').platforms;
const defaultProvidesModuleNodeModules = require('./defaults')
  .providesModuleNodeModules;

const DEFAULT_CONFIG = require('./Config').DEFAULT;
const normalizeConfig = require('./Config').normalize;

import type {IncomingMessage, ServerResponse} from 'http';

import type {Server as HttpServer} from 'http';
import type {Server as HttpsServer} from 'https';

import type {ConfigT} from './Config';
import type {Options as ServerOptions} from './shared/types.flow';
import type {RequestOptions, OutputOptions} from './shared/types.flow.js';

export type {ConfigT} from './Config';

type PublicMetroOptions = {|
  config?: ConfigT,
  maxWorkers?: number,
  projectRoots: Array<string>,
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
  maxWorkers = 1,
  projectRoots = [],
  watch = false,
}: PrivateMetroOptions) {
  const normalizedConfig = config ? normalizeConfig(config) : DEFAULT_CONFIG;

  const assetExts =
    (normalizedConfig.getAssetExts && normalizedConfig.getAssetExts()) || [];
  const sourceExts =
    (normalizedConfig.getSourceExts && normalizedConfig.getSourceExts()) || [];
  const platforms =
    (normalizedConfig.getPlatforms && normalizedConfig.getPlatforms()) || [];

  const transformModulePath = false
    ? ``
    : normalizedConfig.getTransformModulePath();

  const providesModuleNodeModules =
    typeof normalizedConfig.getProvidesModuleNodeModules === 'function'
      ? normalizedConfig.getProvidesModuleNodeModules()
      : defaultProvidesModuleNodeModules;

  const serverOptions: ServerOptions = {
    assetExts: defaultAssetExts.concat(assetExts),
    assetRegistryPath: normalizedConfig.assetRegistryPath,
    blacklistRE: normalizedConfig.getBlacklistRE(),
    extraNodeModules: normalizedConfig.extraNodeModules,
    getPolyfills: normalizedConfig.getPolyfills,
    getModulesRunBeforeMainModule:
      normalizedConfig.getModulesRunBeforeMainModule,
    getTransformOptions: normalizedConfig.getTransformOptions,
    globalTransformCache: null,
    hasteImpl: normalizedConfig.hasteImpl,
    maxWorkers,
    platforms: defaultPlatforms.concat(platforms),
    postMinifyProcess: normalizedConfig.postMinifyProcess,
    postProcessModules: normalizedConfig.postProcessModules,
    postProcessBundleSourcemap: normalizedConfig.postProcessBundleSourcemap,
    providesModuleNodeModules,
    resetCache: false,
    reporter: new TerminalReporter(new Terminal(process.stdout)),
    sourceExts: defaultSourceExts.concat(sourceExts),
    transformCache: TransformCaching.useTempDir(),
    transformModulePath,
    watch,
    workerPath:
      normalizedConfig.getWorkerPath && normalizedConfig.getWorkerPath(),
    projectRoots: await Promise.all(
      normalizedConfig
        .getProjectRoots()
        .concat(projectRoots)
        .map(path => asyncRealpath(path)),
    ),
  };

  return new MetroServer(serverOptions);
}

type CreateConnectMiddlewareOptions = {|
  ...PublicMetroOptions,
|};

exports.createConnectMiddleware = async function(
  options: CreateConnectMiddlewareOptions,
) {
  const metroServer = await runMetro({
    config: options.config,
    maxWorkers: options.maxWorkers,
    projectRoots: options.projectRoots,
    watch: true,
  });

  return (req: IncomingMessage, res: ServerResponse) => {
    return metroServer.processRequest(req, res);
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
|};

exports.runServer = async (options: RunServerOptions) => {
  const serverApp = connect();

  const metroMiddleware = exports.createConnectMiddleware({
    config: options.config,
    maxWorkers: options.maxWorkers,
    projectRoots: options.projectRoots,
  });

  serverApp.use(metroMiddleware);

  let httpServer;

  if (options.secure) {
    httpServer = Https.createServer(
      {
        key: await readFile(options.secureKey),
        cert: await readFile(options.secureCert),
      },
      serverApp,
    );
  } else {
    httpServer = Http.createServer(serverApp);
  }

  // $FlowFixMe: The port parameter IS optional
  httpServer.listen(options.port, options.host, () => {
    options.onReady && options.onReady(httpServer);
  });

  // Disable any kind of automatic timeout behavior for incoming
  // requests in case it takes the packager more than the default
  // timeout of 120 seconds to respond to a request.
  httpServer.timeout = 0;

  return new Promise((resolve, reject) => {
    httpServer.on('error', error => {
      reject(error);
    });

    httpServer.on('close', () => {
      resolve();
    });
  });
};

type RunBuildOptions = {|
  ...PublicMetroOptions,
  entry: string,
  out: string,
  dev?: boolean,
  optimize?: boolean,
  platform?: string,
  sourceMap?: boolean,
  sourceMapUrl?: string,
|};

exports.runBuild = async (options: RunBuildOptions) => {
  const metroServer = await runMetro({
    config: options.config,
    maxWorkers: options.maxWorkers,
    projectRoots: options.projectRoots,
  });

  const requestOptions: RequestOptions = {
    dev: options.dev,
    entryFile: options.entry,
    generateSourceMaps: options.sourceMap || !!options.sourceMapUrl,
    inlineSourceMap: options.sourceMap && !!options.sourceMapUrl,
    minify: options.optimize || false,
    platform: options.platform || `web`,
    sourceMapUrl: options.sourceMapUrl,
  };

  const metroBundle = await MetroBundler.build(metroServer, requestOptions);

  const outputOptions: OutputOptions = {
    bundleOutput: options.out.replace(/(\.js)?$/, '.js'),
    dev: options.dev,
    platform: options.platform || `web`,
  };

  await MetroBundler.save(metroBundle, outputOptions, console.log);
  await metroServer.end();

  return {metroServer, metroBundle};
};

// The symbols below belong to the legacy API and should not be relied upon
Object.assign(exports, require('./legacy'));
