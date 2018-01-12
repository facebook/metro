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

const DependencyGraph = require('../node-haste/DependencyGraph');
const Transformer = require('../JSTransformer');

const assert = require('assert');
const defaults = require('../defaults');
const fs = require('fs');
const getTransformCacheKeyFn = require('../lib/getTransformCacheKeyFn');

const {
  toSegmentTuple,
  fromRawMappings,
  toBabelSegments,
} = require('metro-source-map');

import type {PostProcessModules} from '../DeltaBundler';
import type {Options as JSTransformerOptions} from '../JSTransformer/worker';
import type {GlobalTransformCache} from '../lib/GlobalTransformCache';
import type {TransformCache} from '../lib/TransformCaching';
import type {Reporter} from '../lib/reporting';
import type {HasteImpl} from '../node-haste/Module';
import type {BabelSourceMap} from 'babel-core';
import type {
  MetroSourceMapSegmentTuple,
  MetroSourceMap,
} from 'metro-source-map';

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
  _transformer: Transformer;
  _depGraphPromise: Promise<DependencyGraph>;
  _projectRoots: $ReadOnlyArray<string>;
  _getTransformOptions: void | GetTransformOptions;

  constructor(opts: Options) {
    this._opts = opts;

    opts.projectRoots.forEach(verifyRootExists);

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

    this._depGraphPromise = DependencyGraph.load({
      assetExts: opts.assetExts,
      assetRegistryPath: opts.assetRegistryPath,
      blacklistRE: opts.blacklistRE,
      extraNodeModules: opts.extraNodeModules,
      getPolyfills: opts.getPolyfills,
      getTransformCacheKey: getTransformCacheKeyFn({
        cacheVersion: opts.cacheVersion,
        projectRoots: opts.projectRoots,
        transformModulePath: opts.transformModulePath,
      }),
      globalTransformCache: opts.globalTransformCache,
      hasteImpl: opts.hasteImpl,
      maxWorkers: opts.maxWorkers,
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
    await this._depGraphPromise.then(dependencyGraph =>
      dependencyGraph.getWatcher().end(),
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
}

function verifyRootExists(root) {
  // Verify that the root exists.
  assert(fs.statSync(root).isDirectory(), 'Root has to be a valid directory');
}

module.exports = Bundler;
