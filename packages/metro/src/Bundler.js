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

const {Cache, stableHash} = require('metro-cache');
const {
  toSegmentTuple,
  fromRawMappings,
  toBabelSegments,
} = require('metro-source-map');

import type {
  TransformedCode,
  Options as WorkerOptions,
} from './JSTransformer/worker';
import type {DynamicRequiresBehavior} from './ModuleGraph/worker/collectDependencies';
import type {GlobalTransformCache} from './lib/GlobalTransformCache';
import type {TransformCache} from './lib/TransformCaching';
import type {Reporter} from './lib/reporting';
import type Module from './node-haste/Module';
import type {BabelSourceMap} from '@babel/core';
import type {CacheStore} from 'metro-cache';
import type {CustomResolver} from 'metro-resolver';
import type {
  MetroSourceMapSegmentTuple,
  MetroSourceMap,
} from 'metro-source-map';

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
  +cacheStores: $ReadOnlyArray<CacheStore<TransformedCode>>,
  +cacheVersion: string,
  +dynamicDepsInPackages: DynamicRequiresBehavior,
  +enableBabelRCLookup: boolean,
  +extraNodeModules: {},
  +getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  +getTransformOptions?: GetTransformOptions,
  +globalTransformCache: ?GlobalTransformCache,
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
  +resetCache: boolean,
  +resolveRequest: ?CustomResolver,
  +sourceExts: Array<string>,
  +transformCache: TransformCache,
  +transformModulePath: string,
  +watch: boolean,
  +workerPath: ?string,
|};

const {hasOwnProperty} = Object.prototype;

class Bundler {
  _opts: Options;
  _cache: ?Cache<TransformedCode>;
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
    this._cache = opts.cacheStores.length ? new Cache(opts.cacheStores) : null;

    this._transformer = new Transformer({
      asyncRequireModulePath: opts.asyncRequireModulePath,
      maxWorkers: opts.maxWorkers,
      minifierPath: opts.minifierPath,
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
      assetRegistryPath: opts.assetRegistryPath,
      blacklistRE: opts.blacklistRE,
      // TODO: T26134860 Only use experimental caches if stores are provided.
      experimentalCaches: !!opts.cacheStores.length,
      extraNodeModules: opts.extraNodeModules,
      getPolyfills: opts.getPolyfills,
      getTransformCacheKey,
      globalTransformCache: opts.globalTransformCache,
      hasteImplModulePath: opts.hasteImplModulePath,
      maxWorkers: opts.maxWorkers,
      platforms: new Set(opts.platforms),
      polyfillModuleNames: opts.polyfillModuleNames,
      projectRoots: opts.projectRoots,
      providesModuleNodeModules:
        opts.providesModuleNodeModules || defaults.providesModuleNodeModules,
      reporter: opts.reporter,
      resolveRequest: opts.resolveRequest,
      resetCache: opts.resetCache,
      sourceExts: opts.sourceExts,
      transformCode: this._cachedTransformCode.bind(this),
      transformCache: opts.transformCache,
      watch: opts.watch,
    });

    this._baseHash = stableHash([
      opts.assetExts,
      opts.assetRegistryPath,
      getTransformCacheKey,
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

  async minifyModule(
    path: string,
    code: string,
    map: Array<MetroSourceMapSegmentTuple>,
  ): Promise<{code: string, map: Array<MetroSourceMapSegmentTuple>}> {
    const sourceMap = fromRawMappings([{code, source: code, map, path}]).toMap(
      undefined,
      {},
    );

    const minified = await this._transformer.minify(path, code, sourceMap);
    const result = await this._opts.postMinifyProcess({...minified});

    return {
      code: result.code,
      map: result.map ? toBabelSegments(result.map).map(toSegmentTuple) : [],
    };
  }

  async _cachedTransformCode(
    module: Module,
    code: ?string,
    transformCodeOptions: WorkerOptions,
  ): Promise<TransformedCode> {
    const cache = this._cache;
    let data = null;
    let partialKey;
    let fullKey;
    let sha1;

    // First, try getting the result from the cache if enabled.
    if (cache) {
      const {
        assetDataPlugins,
        customTransformOptions,
        enableBabelRCLookup,
        dev,
        hot,
        inlineRequires,
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

      partialKey = stableHash([
        // This is the hash related to the global Bundler config.
        this._baseHash,

        // Path and code hash.
        module.localPath,

        // We cannot include "transformCodeOptions" because of "projectRoot".
        assetDataPlugins,
        customTransformOptions,
        enableBabelRCLookup,
        dev,
        hot,
        inlineRequires,
        minify,
        platform,
      ]);

      sha1 = (await this.getDependencyGraph()).getSha1(module.path);
      fullKey = Buffer.concat([partialKey, Buffer.from(sha1, 'hex')]);

      const result = await cache.get(fullKey);

      if (result) {
        data = {result, sha1};
      }
    }

    if (!cache && code == null) {
      throw new Error(
        'When not using experimental caches, code should always be provided',
      );
    }

    // Second, if there was no result, compute it ourselves.
    if (!data) {
      data = await this._transformer.transform(
        module.path,
        module.localPath,
        code,
        module.isPolyfill(),
        transformCodeOptions,
        this._opts.assetExts,
        this._opts.assetRegistryPath,
      );
    }

    // Third, propagate the result to all cache layers.
    if (fullKey && partialKey && sha1 && cache) {
      // It could be that the SHA-1 we had back when we sent to the transformer
      // was outdated; if so, recompute it.
      if (sha1 !== data.sha1) {
        fullKey = Buffer.concat([partialKey, Buffer.from(data.sha1, 'hex')]);
      }

      cache.set(fullKey, data.result);
    }

    return data.result;
  }
}

function verifyRootExists(root) {
  // Verify that the root exists.
  assert(fs.statSync(root).isDirectory(), 'Root has to be a valid directory');
}

module.exports = Bundler;
