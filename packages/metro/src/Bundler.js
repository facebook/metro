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

const DependencyGraph = require('./node-haste/DependencyGraph');
const Transformer = require('./JSTransformer');

const assert = require('assert');
const defaults = require('./defaults');
const fs = require('fs');
const getTransformCacheKeyFn = require('./lib/getTransformCacheKeyFn');
const toLocalPath = require('./node-haste/lib/toLocalPath');

const {Cache, stableHash} = require('metro-cache');

import type {TransformResult} from './DeltaBundler';
import type {WorkerOptions} from './JSTransformer/worker';
import type {DynamicRequiresBehavior} from './ModuleGraph/worker/collectDependencies';
import type {Reporter} from './lib/reporting';
import type {BabelSourceMap} from '@babel/core';
import type {CacheStore} from 'metro-cache';
import type {CustomResolver} from 'metro-resolver';
import type {MetroSourceMap} from 'metro-source-map';

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
  map: ?BabelSourceMap,
}) => {code: string, map: ?BabelSourceMap};

export type PostProcessBundleSourcemap = ({
  code: Buffer | string,
  map: MetroSourceMap,
  outFileName: string,
}) => {code: Buffer | string, map: MetroSourceMap | string};

export type Options = {|
  +assetExts: Array<string>,
  +assetRegistryPath: string,
  +asyncRequireModulePath: string,
  +blacklistRE?: RegExp,
  +cacheStores: $ReadOnlyArray<CacheStore<TransformResult<>>>,
  +cacheVersion: string,
  +dynamicDepsInPackages: DynamicRequiresBehavior,
  +enableBabelRCLookup: boolean,
  +extraNodeModules: {},
  +getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  +getTransformOptions?: GetTransformOptions,
  +hasteImplModulePath?: string,
  +maxWorkers: number,
  +minifierPath: string,
  +platforms: Array<string>,
  +polyfillModuleNames: Array<string>,
  +postMinifyProcess: PostMinifyProcess,
  +postProcessBundleSourcemap: PostProcessBundleSourcemap,
  +projectRoots: $ReadOnlyArray<string>,
  +providesModuleNodeModules?: Array<string>,
  +reporter: Reporter,
  +resolveRequest: ?CustomResolver,
  +sourceExts: Array<string>,
  +transformModulePath: string,
  +watch: boolean,
  +workerPath: ?string,
|};

const {hasOwnProperty} = Object.prototype;

class Bundler {
  _opts: Options;
  _cache: Cache<TransformResult<>>;
  _baseHash: string;
  _transformer: Transformer;
  _depGraphPromise: Promise<DependencyGraph>;
  _projectRoots: $ReadOnlyArray<string>;
  _getTransformOptions: void | GetTransformOptions;

  constructor(opts: Options) {
    opts.projectRoots.forEach(verifyRootExists);

    const getTransformCacheKey = getTransformCacheKeyFn({
      asyncRequireModulePath: opts.asyncRequireModulePath,
      cacheVersion: opts.cacheVersion,
      dynamicDepsInPackages: opts.dynamicDepsInPackages,
      projectRoots: opts.projectRoots,
      transformModulePath: opts.transformModulePath,
    });

    this._opts = opts;
    this._cache = new Cache(opts.cacheStores);

    this._transformer = new Transformer({
      asyncRequireModulePath: opts.asyncRequireModulePath,
      maxWorkers: opts.maxWorkers,
      reporters: {
        stdoutChunk: chunk =>
          opts.reporter.update({type: 'worker_stdout_chunk', chunk}),
        stderrChunk: chunk =>
          opts.reporter.update({type: 'worker_stderr_chunk', chunk}),
      },
      transformModulePath: opts.transformModulePath,
      dynamicDepsInPackages: opts.dynamicDepsInPackages,
      workerPath: opts.workerPath || undefined,
    });

    this._depGraphPromise = DependencyGraph.load({
      assetExts: opts.assetExts,
      blacklistRE: opts.blacklistRE,
      extraNodeModules: opts.extraNodeModules,
      hasteImplModulePath: opts.hasteImplModulePath,
      maxWorkers: opts.maxWorkers,
      platforms: new Set(opts.platforms),
      projectRoots: opts.projectRoots,
      providesModuleNodeModules:
        opts.providesModuleNodeModules || defaults.providesModuleNodeModules,
      reporter: opts.reporter,
      resolveRequest: opts.resolveRequest,
      sourceExts: opts.sourceExts,
      watch: opts.watch,
    });

    this._baseHash = stableHash([
      opts.assetExts,
      opts.assetRegistryPath,
      getTransformCacheKey(),
      opts.minifierPath,
    ]).toString('binary');

    this._projectRoots = opts.projectRoots;
    this._getTransformOptions = opts.getTransformOptions;
  }

  getOptions(): Options {
    return this._opts;
  }

  async end() {
    this._transformer.kill();
    await this._depGraphPromise.then(dependencyGraph =>
      dependencyGraph.getWatcher().end(),
    );
  }

  /**
   * Returns the transform options related to several entry files, by calling
   * the config parameter getTransformOptions().
   */
  async getTransformOptionsForEntryFiles(
    entryFiles: $ReadOnlyArray<string>,
    options: {dev: boolean, platform: ?string},
    getDependencies: string => Promise<Array<string>>,
  ): Promise<TransformOptions> {
    if (!this._getTransformOptions) {
      return {
        inlineRequires: false,
      };
    }

    const {transform} = await this._getTransformOptions(
      entryFiles,
      {dev: options.dev, hot: true, platform: options.platform},
      getDependencies,
    );

    return transform || {inlineRequires: false};
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

  getDependencyGraph(): Promise<DependencyGraph> {
    return this._depGraphPromise;
  }

  async transformFile(
    filePath: string,
    transformCodeOptions: WorkerOptions,
  ): Promise<TransformResult<>> {
    const cache = this._cache;

    const {
      assetDataPlugins,
      customTransformOptions,
      enableBabelRCLookup,
      dev,
      hot,
      inlineRequires,
      isScript,
      minify,
      platform,
      projectRoot: _projectRoot, // Blacklisted property.
      ...extra
    } = transformCodeOptions;

    for (const key in extra) {
      if (hasOwnProperty.call(extra, key)) {
        throw new Error(
          'Extra keys detected: ' + Object.keys(extra).join(', '),
        );
      }
    }

    const localPath = toLocalPath(this._projectRoots, filePath);

    const partialKey = stableHash([
      // This is the hash related to the global Bundler config.
      this._baseHash,

      // Path.
      localPath,

      // We cannot include "transformCodeOptions" because of "projectRoot".
      assetDataPlugins,
      customTransformOptions,
      enableBabelRCLookup,
      dev,
      hot,
      inlineRequires,
      isScript,
      minify,
      platform,
    ]);

    const sha1 = (await this.getDependencyGraph()).getSha1(filePath);
    let fullKey = Buffer.concat([partialKey, Buffer.from(sha1, 'hex')]);
    const result = await cache.get(fullKey);

    // A valid result from the cache is used directly; otherwise we call into
    // the transformer to computed the corresponding result.
    const data = result
      ? {result, sha1}
      : await this._transformer.transform(
          filePath,
          localPath,
          transformCodeOptions,
          this._opts.assetExts,
          this._opts.assetRegistryPath,
          this._opts.minifierPath,
        );

    // Only re-compute the full key if the SHA-1 changed. This is because
    // references are used by the cache implementation in a weak map to keep
    // track of the cache that returned the result.
    if (sha1 !== data.sha1) {
      fullKey = Buffer.concat([partialKey, Buffer.from(data.sha1, 'hex')]);
    }

    cache.set(fullKey, data.result);

    return {
      ...data.result,
      getSource() {
        return fs.readFileSync(filePath, 'utf8');
      },
    };
  }
}

function verifyRootExists(root) {
  // Verify that the root exists.
  assert(fs.statSync(root).isDirectory(), 'Root has to be a valid directory');
}

module.exports = Bundler;
