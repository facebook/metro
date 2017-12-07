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

const defaults = require('../defaults');

const {
  compactMapping,
  fromRawMappings,
  toRawMappings,
} = require('metro-source-map');
const pathJoin = require('path').join;

import type Module, {HasteImpl, TransformCode} from '../node-haste/Module';
import type {CompactRawMappings} from '../lib/SourceMap';
import type {PostMinifyProcess} from '../Bundler';
import type {Reporter} from '../lib/reporting';
import type {
  TransformCache,
  GetTransformCacheKey,
} from '../lib/TransformCaching';
import type {GlobalTransformCache} from '../lib/GlobalTransformCache';

import typeof {minify as MinifyCode} from '../JSTransformer/worker';

type Options = {|
  +assetExts: Array<string>,
  +assetRegistryPath: string,
  +blacklistRE?: RegExp,
  +extraNodeModules: ?{},
  +getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  +getTransformCacheKey: GetTransformCacheKey,
  +globalTransformCache: ?GlobalTransformCache,
  +hasteImpl?: ?HasteImpl,
  +maxWorkers: number,
  +minifyCode: MinifyCode,
  +postMinifyProcess: PostMinifyProcess,
  +platforms: Set<string>,
  +polyfillModuleNames?: Array<string>,
  +projectRoots: $ReadOnlyArray<string>,
  +providesModuleNodeModules: Array<string>,
  +reporter: Reporter,
  +resetCache: boolean,
  +sourceExts: Array<string>,
  +transformCache: TransformCache,
  +transformCode: TransformCode,
  +watch: boolean,
|};

class Resolver {
  _depGraph: DependencyGraph;
  _getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>;
  _minifyCode: MinifyCode;
  _postMinifyProcess: PostMinifyProcess;
  _polyfillModuleNames: Array<string>;

  constructor(opts: Options, depGraph: DependencyGraph) {
    this._getPolyfills = opts.getPolyfills;
    this._minifyCode = opts.minifyCode;
    this._postMinifyProcess = opts.postMinifyProcess;
    this._polyfillModuleNames = opts.polyfillModuleNames || [];
    this._depGraph = depGraph;
  }

  static async load(opts: Options): Promise<Resolver> {
    const depGraph = await DependencyGraph.load({
      assetDependencies: [opts.assetRegistryPath],
      assetExts: opts.assetExts,
      extraNodeModules: opts.extraNodeModules,
      forceNodeFilesystemAPI: false,
      getTransformCacheKey: opts.getTransformCacheKey,
      globalTransformCache: opts.globalTransformCache,
      hasteImpl: opts.hasteImpl,
      ignorePattern: opts.blacklistRE || / ^/ /* matches nothing */,
      maxWorkers: opts.maxWorkers,
      platforms: opts.platforms,
      preferNativePlatform: true,
      providesModuleNodeModules: opts.providesModuleNodeModules,
      reporter: opts.reporter,
      resetCache: opts.resetCache,
      roots: opts.projectRoots,
      sourceExts: opts.sourceExts,
      transformCache: opts.transformCache,
      transformCode: opts.transformCode,
      useWatchman: true,
      watch: opts.watch,
    });
    return new Resolver(opts, depGraph);
  }

  getModuleSystemDependencies({dev = true}: {dev?: boolean}): Array<Module> {
    const prelude = dev
      ? pathJoin(__dirname, 'polyfills/prelude_dev.js')
      : pathJoin(__dirname, 'polyfills/prelude.js');

    const moduleSystem = defaults.moduleSystem;

    return [prelude, moduleSystem].map(moduleName =>
      this._depGraph.createPolyfill({
        file: moduleName,
        id: moduleName,
        dependencies: [],
      }),
    );
  }

  async minifyModule(
    path: string,
    code: string,
    map: CompactRawMappings,
  ): Promise<{code: string, map: CompactRawMappings}> {
    const sourceMap = fromRawMappings([{code, source: code, map, path}]).toMap(
      undefined,
      {},
    );

    const minified = await this._minifyCode(path, code, sourceMap);
    const result = await this._postMinifyProcess({...minified});

    return {
      code: result.code,
      map: result.map ? toRawMappings(result.map).map(compactMapping) : [],
    };
  }

  getDependencyGraph(): DependencyGraph {
    return this._depGraph;
  }
}

module.exports = Resolver;
