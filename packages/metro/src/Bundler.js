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
const fs = require('fs');
const getTransformCacheKeyFn = require('./lib/getTransformCacheKeyFn');
const toLocalPath = require('./node-haste/lib/toLocalPath');

const {Cache, stableHash} = require('metro-cache');

import type {TransformResult} from './DeltaBundler';
import type {WorkerOptions} from './JSTransformer/worker';
import type {
  ConfigT,
  GetTransformOptions,
} from 'metro-config/src/configTypes.flow';

const {hasOwnProperty} = Object.prototype;

class Bundler {
  _opts: ConfigT;
  _cache: Cache<TransformResult<>>;
  _baseHash: string;
  _transformer: Transformer;
  _depGraphPromise: Promise<DependencyGraph>;
  _getTransformOptions: GetTransformOptions;
  _projectRoot: string;

  constructor(opts: ConfigT) {
    opts.watchFolders.forEach(verifyRootExists);

    const getTransformCacheKey = getTransformCacheKeyFn({
      asyncRequireModulePath: opts.transformer.asyncRequireModulePath,
      cacheVersion: opts.cacheVersion,
      dynamicDepsInPackages: opts.transformer.dynamicDepsInPackages,
      projectRoot: opts.projectRoot,
      transformModulePath: opts.transformModulePath,
    });

    this._opts = opts;
    this._cache = new Cache(opts.cacheStores);

    this._transformer = new Transformer({
      asyncRequireModulePath: opts.transformer.asyncRequireModulePath,
      maxWorkers: opts.maxWorkers,
      reporters: {
        stdoutChunk: chunk =>
          opts.reporter.update({type: 'worker_stdout_chunk', chunk}),
        stderrChunk: chunk =>
          opts.reporter.update({type: 'worker_stderr_chunk', chunk}),
      },
      transformModulePath: opts.transformModulePath,
      dynamicDepsInPackages: opts.transformer.dynamicDepsInPackages,
      workerPath: opts.transformer.workerPath || undefined,
    });

    const blacklistRE: RegExp = opts.resolver.blacklistRE;
    this._depGraphPromise = DependencyGraph.load({
      assetExts: opts.resolver.assetExts,
      blacklistRE,
      extraNodeModules: opts.resolver.extraNodeModules,
      hasteImplModulePath: opts.resolver.hasteImplModulePath,
      mainFields: opts.resolver.resolverMainFields,
      maxWorkers: opts.maxWorkers,
      platforms: new Set(opts.resolver.platforms),
      projectRoot: opts.projectRoot,
      providesModuleNodeModules: opts.resolver.providesModuleNodeModules,
      reporter: opts.reporter,
      resetCache: opts.resetCache,
      resolveRequest: opts.resolver.resolveRequest,
      sourceExts: opts.resolver.sourceExts,
      useWatchman: opts.resolver.useWatchman,
      watch: opts.watch,
      watchFolders: opts.watchFolders,
    });

    this._baseHash = stableHash([
      opts.resolver.assetExts,
      opts.transformer.assetRegistryPath,
      getTransformCacheKey(),
      opts.transformer.minifierPath,
    ]).toString('binary');

    this._projectRoot = opts.projectRoot;
    this._getTransformOptions = opts.transformer.getTransformOptions;
  }

  getOptions(): ConfigT {
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
  ): Promise<{|
    +inlineRequires: {+blacklist: {[string]: true}} | boolean,
  |}> {
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
      enableBabelRCLookup: this._opts.transformer.enableBabelRCLookup,
      projectRoot: this._projectRoot,
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

    const localPath = toLocalPath(this._opts.watchFolders, filePath);

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
          this._opts.resolver.assetExts,
          this._opts.transformer.assetRegistryPath,
          this._opts.transformer.minifierPath,
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
