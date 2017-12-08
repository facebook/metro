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

const assert = require('assert');
const crypto = require('crypto');
const debug = require('debug')('Metro:Bundler');
const fs = require('fs');
const Transformer = require('../JSTransformer');
const Resolver = require('../Resolver');
const path = require('path');
const defaults = require('../defaults');
const createModuleIdFactory = require('../lib/createModuleIdFactory');

const {sep: pathSeparator} = require('path');

const VERSION = require('../../package.json').version;

import type {HasteImpl} from '../node-haste/Module';
import type {MappingsMap, SourceMap} from '../lib/SourceMap';
import type {Options as JSTransformerOptions} from '../JSTransformer/worker';
import type {Reporter} from '../lib/reporting';
import type {TransformCache} from '../lib/TransformCaching';
import type {GlobalTransformCache} from '../lib/GlobalTransformCache';
import type {PostProcessModules} from '../DeltaBundler';

export type BundlingOptions = {|
  +preloadedModules: ?{[string]: true} | false,
  +ramGroups: ?Array<string>,
  +transformer: JSTransformerOptions,
|};

type TransformOptions = {|
  +inlineRequires: {+blacklist: {[string]: true}} | boolean,
|};

export type ExtraTransformOptions = {
  +preloadedModules?: {[path: string]: true} | false,
  +ramGroups?: Array<string>,
  +transform?: TransformOptions,
};

export type GetTransformOptionsOpts = {|
  dev: boolean,
  hot: boolean,
  platform: ?string,
|};

export type GetTransformOptions = (
  entryPoints: $ReadOnlyArray<string>,
  options: GetTransformOptionsOpts,
  getDependenciesOf: (string) => Promise<Array<string>>,
) => Promise<ExtraTransformOptions>;

export type PostMinifyProcess = ({
  code: string,
  map: ?MappingsMap,
}) => {code: string, map: ?MappingsMap};

export type PostProcessBundleSourcemap = ({
  code: Buffer | string,
  map: SourceMap,
  outFileName: string,
}) => {code: Buffer | string, map: SourceMap | string};

export type Options = {|
  +assetExts: Array<string>,
  +assetRegistryPath: string,
  +blacklistRE?: RegExp,
  +cacheVersion: string,
  +enableBabelRCLookup: boolean,
  +extraNodeModules: {},
  +getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  +getTransformOptions?: GetTransformOptions,
  +globalTransformCache: ?GlobalTransformCache,
  +hasteImpl?: HasteImpl,
  +maxWorkers: number,
  +platforms: Array<string>,
  +polyfillModuleNames: Array<string>,
  +postMinifyProcess: PostMinifyProcess,
  +postProcessBundleSourcemap: PostProcessBundleSourcemap,
  +postProcessModules?: PostProcessModules,
  +projectRoots: $ReadOnlyArray<string>,
  +providesModuleNodeModules?: Array<string>,
  +reporter: Reporter,
  +resetCache: boolean,
  +sourceExts: Array<string>,
  +transformCache: TransformCache,
  +transformModulePath: string,
  +watch: boolean,
  +workerPath: ?string,
|};

class Bundler {
  _opts: Options;
  _getModuleId: (path: string) => number;
  _transformer: Transformer;
  _resolverPromise: Promise<Resolver>;
  _projectRoots: $ReadOnlyArray<string>;
  _getTransformOptions: void | GetTransformOptions;

  constructor(opts: Options) {
    this._opts = opts;

    opts.projectRoots.forEach(verifyRootExists);

    const transformModuleStr = fs.readFileSync(opts.transformModulePath);
    const transformModuleHash = crypto
      .createHash('sha1')
      .update(transformModuleStr)
      .digest('hex');

    const stableProjectRoots = opts.projectRoots.map(p => {
      return path.relative(path.join(__dirname, '../../../..'), p);
    });

    const cacheKeyParts = [
      'metro-cache',
      VERSION,
      opts.cacheVersion,
      stableProjectRoots
        .join(',')
        .split(pathSeparator)
        .join('-'),
      transformModuleHash,
    ];

    this._getModuleId = createModuleIdFactory();

    let getCacheKey = (options: mixed) => '';
    if (opts.transformModulePath) {
      /* $FlowFixMe: dynamic requires prevent static typing :'(  */
      const transformer = require(opts.transformModulePath);
      if (typeof transformer.getCacheKey !== 'undefined') {
        getCacheKey = transformer.getCacheKey;
      }
    }

    const transformCacheKey = crypto
      .createHash('sha1')
      .update(cacheKeyParts.join('$'))
      .digest('hex');

    debug(`Using transform cache key "${transformCacheKey}"`);
    this._transformer = new Transformer(
      opts.transformModulePath,
      opts.maxWorkers,
      {
        stdoutChunk: chunk =>
          opts.reporter.update({type: 'worker_stdout_chunk', chunk}),
        stderrChunk: chunk =>
          opts.reporter.update({type: 'worker_stderr_chunk', chunk}),
      },
      opts.workerPath || undefined,
    );

    const getTransformCacheKey = options => {
      return transformCacheKey + getCacheKey(options);
    };

    this._resolverPromise = Resolver.load({
      assetExts: opts.assetExts,
      assetRegistryPath: opts.assetRegistryPath,
      blacklistRE: opts.blacklistRE,
      extraNodeModules: opts.extraNodeModules,
      getPolyfills: opts.getPolyfills,
      getTransformCacheKey,
      globalTransformCache: opts.globalTransformCache,
      hasteImpl: opts.hasteImpl,
      maxWorkers: opts.maxWorkers,
      minifyCode: this._transformer.minify.bind(this._transformer),
      postMinifyProcess: this._opts.postMinifyProcess,
      platforms: new Set(opts.platforms),
      polyfillModuleNames: opts.polyfillModuleNames,
      projectRoots: opts.projectRoots,
      providesModuleNodeModules:
        opts.providesModuleNodeModules || defaults.providesModuleNodeModules,
      reporter: opts.reporter,
      resetCache: opts.resetCache,
      sourceExts: opts.sourceExts,
      transformCode: (module, code, transformCodeOptions) =>
        this._transformer.transformFile(
          module.path,
          module.localPath,
          code,
          module.isPolyfill(),
          transformCodeOptions,
          this._opts.assetExts,
          this._opts.assetRegistryPath,
        ),
      transformCache: opts.transformCache,
      watch: opts.watch,
    });

    this._projectRoots = opts.projectRoots;
    this._getTransformOptions = opts.getTransformOptions;
  }

  getOptions(): Options {
    return this._opts;
  }

  async end() {
    this._transformer.kill();
    await this._resolverPromise.then(resolver =>
      resolver
        .getDependencyGraph()
        .getWatcher()
        .end(),
    );
  }

  /**
   * Returns the transform options related to a specific entry file, by calling
   * the config parameter getTransformOptions().
   */
  async getTransformOptionsForEntryFile(
    entryFile: string,
    options: {dev: boolean, platform: ?string},
    getDependencies: string => Promise<Array<string>>,
  ): Promise<TransformOptions> {
    if (!this._getTransformOptions) {
      return {
        inlineRequires: false,
      };
    }

    const {transform} = await this._getTransformOptions(
      [entryFile],
      {dev: options.dev, hot: true, platform: options.platform},
      getDependencies,
    );

    return transform || {inlineRequires: false};
  }

  /**
   * Returns the options needed to create a RAM bundle.
   */
  async getRamOptions(
    entryFile: string,
    options: {dev: boolean, platform: ?string},
    getDependencies: string => Promise<Array<string>>,
  ): Promise<{|
    +preloadedModules: {[string]: true},
    +ramGroups: Array<string>,
  |}> {
    if (!this._getTransformOptions) {
      return {
        preloadedModules: {},
        ramGroups: [],
      };
    }

    const {preloadedModules, ramGroups} = await this._getTransformOptions(
      [entryFile],
      {dev: options.dev, hot: true, platform: options.platform},
      getDependencies,
    );

    return {
      preloadedModules: preloadedModules || {},
      ramGroups: ramGroups || [],
    };
  }

  /*
   * Helper method to return the global transform options that are kept in the
   * Bundler.
   */
  getGlobalTransformOptions(): {
    enableBabelRCLookup: boolean,
    projectRoot: string,
  } {
    return {
      enableBabelRCLookup: this._opts.enableBabelRCLookup,
      projectRoot: this._projectRoots[0],
    };
  }

  getResolver(): Promise<Resolver> {
    return this._resolverPromise;
  }
}

function verifyRootExists(root) {
  // Verify that the root exists.
  assert(fs.statSync(root).isDirectory(), 'Root has to be a valid directory');
}

module.exports = Bundler;
