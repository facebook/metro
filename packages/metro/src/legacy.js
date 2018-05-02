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

const blacklist = require('./blacklist');
const debug = require('debug');
const invariant = require('fbjs/lib/invariant');
const makeHMRConfig = require('./hmrConfig');

const {Logger} = require('metro-core');
const {fromRawMappings, toSegmentTuple} = require('metro-source-map');

import type {ConfigT as MetroConfig} from './Config';
import type Server from './Server';
import type {Options as ServerOptions} from './shared/types.flow';

exports.createBlacklist = blacklist;
exports.sourceMaps = {fromRawMappings, compactMapping: toSegmentTuple};
exports.createServer = createServer;
exports.Logger = Logger;
exports.makeHMRConfig = makeHMRConfig;

export type ConfigT = MetroConfig;
type Options = {|
  ...ServerOptions,
  // optional types to force flow errors in `toServerOptions`
  nonPersistent?: ?boolean,
  verbose?: ?boolean,
  targetBabelVersion?: number,
|};

type PublicBundleOptions = {
  +dev?: boolean,
  +entryFile: string,
  +inlineSourceMap?: boolean,
  +minify?: boolean,
  +platform?: string,
  +runModule?: boolean,
  +sourceMapUrl?: string,
};

/**
 * This is a public API, so we don't trust the value and purposefully downgrade
 * it as `mixed`. Because it understands `invariant`, Flow ensure that we
 * refine these values completely.
 */
function assertPublicBundleOptions(bo: mixed): PublicBundleOptions {
  invariant(
    typeof bo === 'object' && bo != null,
    'bundle options must be an object',
  );
  invariant(
    bo.dev === undefined || typeof bo.dev === 'boolean',
    'bundle options field `dev` must be a boolean',
  );
  const {entryFile} = bo;
  invariant(
    typeof entryFile === 'string',
    'bundle options must contain a string field `entryFile`',
  );
  invariant(
    bo.inlineSourceMap === undefined || typeof bo.inlineSourceMap === 'boolean',
    'bundle options field `inlineSourceMap` must be a boolean',
  );
  invariant(
    bo.minify === undefined || typeof bo.minify === 'boolean',
    'bundle options field `minify` must be a boolean',
  );
  invariant(
    bo.platform === undefined || typeof bo.platform === 'string',
    'bundle options field `platform` must be a string',
  );
  invariant(
    bo.runModule === undefined || typeof bo.runModule === 'boolean',
    'bundle options field `runModule` must be a boolean',
  );
  invariant(
    bo.sourceMapUrl === undefined || typeof bo.sourceMapUrl === 'string',
    'bundle options field `sourceMapUrl` must be a boolean',
  );
  return {entryFile, ...bo};
}

exports.build = async function(
  options: Options,
  bundleOptions: PublicBundleOptions,
): Promise<{code: string, map: string}> {
  if (options.targetBabelVersion !== undefined) {
    process.env.BABEL_VERSION = String(options.targetBabelVersion);
  }
  var server = createNonPersistentServer(options);
  const ServerClass = require('./Server');

  const result = await server.build({
    ...ServerClass.DEFAULT_BUNDLE_OPTIONS,
    ...assertPublicBundleOptions(bundleOptions),
    bundleType: 'todo',
  });

  server.end();

  return result;
};

exports.getOrderedDependencyPaths = async function(
  options: Options,
  depOptions: {
    +entryFile: string,
    +dev: boolean,
    +platform: string,
    +minify: boolean,
  },
): Promise<Array<string>> {
  var server = createNonPersistentServer(options);

  const paths = await server.getOrderedDependencyPaths(depOptions);
  server.end();

  return paths;
};

function enableDebug() {
  // Metro Bundler logs debug messages using the 'debug' npm package, and uses
  // the following prefix throughout.
  // To enable debugging, we need to set our pattern or append it to any
  // existing pre-configured pattern to avoid disabling logging for
  // other packages
  var debugPattern = 'Metro:*';
  var existingPattern = debug.load();
  if (existingPattern) {
    debugPattern += ',' + existingPattern;
  }
  debug.enable(debugPattern);
}

function createServer(options: Options): Server {
  // the debug module is configured globally, we need to enable debugging
  // *before* requiring any packages that use `debug` for logging
  if (options.verbose) {
    enableDebug();
  }

  // Some callsites may not be Flowified yet.
  invariant(
    options.assetRegistryPath != null,
    'createServer() requires assetRegistryPath',
  );

  const ServerClass = require('./Server');
  return new ServerClass(toServerOptions(options));
}

function createNonPersistentServer(options: Options): Server {
  return createServer(options);
}

function toServerOptions(options: Options): ServerOptions {
  return {
    assetTransforms: options.assetTransforms,
    assetExts: options.assetExts,
    assetRegistryPath: options.assetRegistryPath,
    asyncRequireModulePath: options.asyncRequireModulePath,
    blacklistRE: options.blacklistRE,
    cacheStores: options.cacheStores,
    cacheVersion: options.cacheVersion,
    dynamicDepsInPackages: options.dynamicDepsInPackages,
    enableBabelRCLookup: options.enableBabelRCLookup,
    extraNodeModules: options.extraNodeModules,
    getModulesRunBeforeMainModule: options.getModulesRunBeforeMainModule,
    getPolyfills: options.getPolyfills,
    getRunModuleStatement: options.getRunModuleStatement,
    getTransformOptions: options.getTransformOptions,
    hasteImplModulePath: options.hasteImplModulePath,
    maxWorkers: options.maxWorkers,
    minifierPath: options.minifierPath,
    platforms: options.platforms,
    polyfillModuleNames: options.polyfillModuleNames,
    postMinifyProcess: options.postMinifyProcess,
    postProcessBundleSourcemap: options.postProcessBundleSourcemap,
    projectRoots: options.projectRoots,
    providesModuleNodeModules: options.providesModuleNodeModules,
    reporter: options.reporter,
    resetCache: options.resetCache,
    resolveRequest: options.resolveRequest,
    silent: options.silent,
    sourceExts: options.sourceExts,
    transformModulePath: options.transformModulePath,
    watch:
      typeof options.watch === 'boolean'
        ? options.watch
        : !!options.nonPersistent,
    workerPath: options.workerPath,
  };
}
