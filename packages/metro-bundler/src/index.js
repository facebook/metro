/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */

'use strict';

const Logger = require('./Logger');
const TransformCaching = require('./lib/TransformCaching');

const blacklist = require('./blacklist');
const debug = require('debug');
const invariant = require('fbjs/lib/invariant');

const {fromRawMappings, compactMapping} = require('./Bundler/source-map');

import type Server, {Options as ServerOptions} from './Server';
import type {TransformCache} from './lib/TransformCaching';

exports.createBlacklist = blacklist;
exports.sourceMaps = {fromRawMappings, compactMapping};
exports.createServer = createServer;
exports.Logger = Logger;

type Options = {|
  ...ServerOptions,
  // optional types to force flow errors in `toServerOptions`
  nonPersistent?: ?boolean,
  transformCache?: ?TransformCache,
  verbose?: ?boolean,
|};

type PublicBundleOptions = {
  +dev?: boolean,
  +entryFile: string,
  +generateSourceMaps?: boolean,
  +inlineSourceMap?: boolean,
  +minify?: boolean,
  +platform?: string,
  +runModule?: boolean,
  +sourceMapUrl?: string,
};

exports.TransformCaching = TransformCaching;

/**
 * This is a public API, so we don't trust the value and purposefully downgrade
 * it as `mixed`. Because it understands `invariant`, Flow ensure that we
 * refine these values completely.
 */
function assertPublicBundleOptions(bo: mixed): PublicBundleOptions {
  invariant(typeof bo === 'object' && bo != null, 'bundle options must be an object');
  invariant(bo.dev === undefined || typeof bo.dev === 'boolean', 'bundle options field `dev` must be a boolean');
  const {entryFile} = bo;
  invariant(typeof entryFile === 'string', 'bundle options must contain a string field `entryFile`');
  invariant(bo.generateSourceMaps === undefined || typeof bo.generateSourceMaps === 'boolean', 'bundle options field `generateSourceMaps` must be a boolean');
  invariant(bo.inlineSourceMap === undefined || typeof bo.inlineSourceMap === 'boolean', 'bundle options field `inlineSourceMap` must be a boolean');
  invariant(bo.minify === undefined || typeof bo.minify === 'boolean', 'bundle options field `minify` must be a boolean');
  invariant(bo.platform === undefined || typeof bo.platform === 'string', 'bundle options field `platform` must be a string');
  invariant(bo.runModule === undefined || typeof bo.runModule === 'boolean', 'bundle options field `runModule` must be a boolean');
  invariant(bo.sourceMapUrl === undefined || typeof bo.sourceMapUrl === 'string', 'bundle options field `sourceMapUrl` must be a boolean');
  return {entryFile, ...bo};
}

exports.buildBundle = function(options: Options, bundleOptions: PublicBundleOptions) {
  var server = createNonPersistentServer(options);
  const ServerClass = require('./Server');
  return server.buildBundle({
    ...ServerClass.DEFAULT_BUNDLE_OPTIONS,
    ...assertPublicBundleOptions(bundleOptions),
  }).then(p => {
    server.end();
    return p;
  });
};

exports.getOrderedDependencyPaths = function(options: Options, depOptions: {
  +entryFile: string,
  +dev: boolean,
  +platform: string,
  +minify: boolean,
  +generateSourceMaps: boolean,
}) {
  var server = createNonPersistentServer(options);
  return server.getOrderedDependencyPaths(depOptions)
    .then(function(paths) {
      server.end();
      return paths;
    });
};

function enableDebug() {
  // react-packager logs debug messages using the 'debug' npm package, and uses
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
  invariant(options.assetRegistryPath != null, 'createServer() requires assetRegistryPath');

  const ServerClass = require('./Server');
  return new ServerClass(toServerOptions(options));
}

function createNonPersistentServer(options: Options): Server {
  return createServer(options);
}

function toServerOptions(options: Options): ServerOptions {
  return {
    assetExts: options.assetExts,
    assetRegistryPath: options.assetRegistryPath,
    blacklistRE: options.blacklistRE,
    cacheVersion: options.cacheVersion,
    enableBabelRCLookup: options.enableBabelRCLookup,
    extraNodeModules: options.extraNodeModules,
    getPolyfills: options.getPolyfills,
    getTransformOptions: options.getTransformOptions,
    globalTransformCache: options.globalTransformCache,
    hasteImpl: options.hasteImpl,
    maxWorkers: options.maxWorkers,
    moduleFormat: options.moduleFormat,
    platforms: options.platforms,
    polyfillModuleNames: options.polyfillModuleNames,
    postProcessModules: options.postProcessModules,
    postMinifyProcess: options.postMinifyProcess,
    postProcessBundleSourcemap: options.postProcessBundleSourcemap,
    projectRoots: options.projectRoots,
    providesModuleNodeModules: options.providesModuleNodeModules,
    reporter: options.reporter,
    resetCache: options.resetCache,
    silent: options.silent,
    sourceExts: options.sourceExts,
    transformCache: options.transformCache || TransformCaching.useTempDir(),
    transformModulePath: options.transformModulePath,
    watch: typeof options.watch === 'boolean' ? options.watch : !!options.nonPersistent,
    workerPath: options.workerPath,
  };
}
