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

const DependencyGraph = require('./node-haste/DependencyGraph');
const Transformer = require('./JSTransformer');

const assert = require('assert');
const fs = require('fs');
const getTransformCacheKeyFn = require('./lib/getTransformCacheKeyFn');
const toLocalPath = require('./node-haste/lib/toLocalPath');

const {Cache, stableHash} = require('metro-cache');

import type {WorkerOptions} from './DeltaBundler/Worker';
import type {TransformResult} from './DeltaBundler';
import type {ConfigT} from 'metro-config/src/configTypes.flow';

const {hasOwnProperty} = Object.prototype;

class Bundler {
  _opts: ConfigT;
  _cache: Cache<TransformResult<>>;
  _baseHash: string;
  _transformer: Transformer;
  _depGraphPromise: Promise<DependencyGraph>;

  constructor(opts: ConfigT) {
    opts.watchFolders.forEach(verifyRootExists);

    this._opts = opts;
    this._cache = new Cache(opts.cacheStores);

    this._transformer = new Transformer({
      maxWorkers: opts.maxWorkers,
      reporters: {
        stdoutChunk: chunk =>
          opts.reporter.update({type: 'worker_stdout_chunk', chunk}),
        stderrChunk: chunk =>
          opts.reporter.update({type: 'worker_stderr_chunk', chunk}),
      },
      workerPath: opts.transformer.workerPath || undefined,
    });

    this._depGraphPromise = DependencyGraph.load({
      assetExts: opts.resolver.assetExts,
      blacklistRE: opts.resolver.blacklistRE,
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

    try {
      const getTransformCacheKey = getTransformCacheKeyFn({
        babelTransformerPath: opts.transformer.babelTransformerPath,
        cacheVersion: opts.cacheVersion,
        projectRoot: opts.projectRoot,
        transformerPath: opts.transformerPath,
      });

      this._baseHash = stableHash([getTransformCacheKey()]).toString('binary');
    } catch (e) {
      this.end();
      throw e;
    }
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

  getDependencyGraph(): Promise<DependencyGraph> {
    return this._depGraphPromise;
  }

  async transformFile(
    filePath: string,
    workerOptions: WorkerOptions,
  ): Promise<TransformResult<>> {
    const cache = this._cache;

    const {
      assetPlugins,
      assetRegistryPath,
      asyncRequireModulePath,
      // Already in the global cache key.
      babelTransformerPath: _babelTransformerPath,
      dynamicDepsInPackages,
      minifierPath,
      optimizationSizeLimit,
      transformOptions: {
        customTransformOptions,
        enableBabelRCLookup,
        experimentalImportSupport,
        dev,
        hot,
        inlineRequires,
        minify,
        platform,
        projectRoot: _projectRoot, // Blacklisted property.
      },
      type,
      ...extra
    } = workerOptions;

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
      assetPlugins,
      assetRegistryPath,
      asyncRequireModulePath,
      dynamicDepsInPackages,
      minifierPath,
      optimizationSizeLimit,

      customTransformOptions,
      enableBabelRCLookup,
      experimentalImportSupport,
      dev,
      hot,
      inlineRequires,
      minify,
      platform,
      type,
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
          this._opts.transformerPath,
          workerOptions,
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
        return fs.readFileSync(filePath);
      },
    };
  }
}

function verifyRootExists(root) {
  // Verify that the root exists.
  assert(fs.statSync(root).isDirectory(), 'Root has to be a valid directory');
}

module.exports = Bundler;
