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

import type {GlobalTransformCache} from '../lib/GlobalTransformCache';
import type {
  TransformCache,
  GetTransformCacheKey,
} from '../lib/TransformCaching';
import type {Reporter} from '../lib/reporting';
import type {HasteImpl, TransformCode} from '../node-haste/Module';

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

  constructor(opts: Options, depGraph: DependencyGraph) {
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

  getDependencyGraph(): DependencyGraph {
    return this._depGraph;
  }
}

module.exports = Resolver;
