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
} = require('../Bundler/source-map');
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
  +hasteImpl?: HasteImpl,
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
      ignorePattern: opts.blacklistRE || / ^/ /* matches nothing */,
      maxWorkers: opts.maxWorkers,
      moduleOptions: {
        hasteImpl: opts.hasteImpl,
        resetCache: opts.resetCache,
        transformCache: opts.transformCache,
      },
      platforms: opts.platforms,
      preferNativePlatform: true,
      providesModuleNodeModules: opts.providesModuleNodeModules,
      reporter: opts.reporter,
      resetCache: opts.resetCache,
      roots: opts.projectRoots,
      sourceExts: opts.sourceExts,
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

  resolveRequires(
    getModuleId: (path: string) => number,
    code: string,
    dependencyPairs: Map<string, string>,
    dependencyOffsets: Array<number> = [],
  ): string {
    const resolvedDeps = Object.create(null);

    // here, we build a map of all require strings (relative and absolute)
    // to the canonical ID of the module they reference
    for (const [name, path] of dependencyPairs) {
      resolvedDeps[name] = getModuleId(path);
    }

    // if we have a canonical ID for the module imported here,
    // we use it, so that require() is always called with the same
    // id for every module.
    // Example:
    // -- in a/b.js:
    //    require('./c') => require(3);
    // -- in b/index.js:
    //    require('../a/c') => require(3);
    return dependencyOffsets
      .reduceRight(
        ([unhandled, handled], offset) => [
          unhandled.slice(0, offset),
          replaceDependencyID(unhandled.slice(offset) + handled, resolvedDeps),
        ],
        [code, ''],
      )
      .join('');
  }

  wrapModule({
    path,
    getModuleId,
    dependencyPairs,
    dependencyOffsets,
    name,
    code,
    dev = true,
  }: {
    path: string,
    getModuleId: (path: string) => number,
    dependencyPairs: Map<string, string>,
    dependencyOffsets: Array<number>,
    name: string,
    code: string,
    dev?: boolean,
  }): string {
    code = this.resolveRequires(
      getModuleId,
      code,
      dependencyPairs,
      dependencyOffsets,
    );

    return defineModuleCode(getModuleId(path), code, name, dev);
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

function defineModuleCode(moduleName, code, verboseName = '', dev = true) {
  return [
    `__d(/* ${verboseName} */`,
    'function(global, require, module, exports) {', // module factory
    code,
    '\n}, ',
    `${JSON.stringify(moduleName)}`, // module id, null = id map. used in ModuleGraph
    dev ? `, null, ${JSON.stringify(verboseName)}` : '',
    ');',
  ].join('');
}

function definePolyfillCode(code) {
  return [
    '(function(global) {',
    code,
    `\n})(typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : this);`,
  ].join('');
}

const reDepencencyString = /^(['"])([^'"']*)\1/;
function replaceDependencyID(stringWithDependencyIDAtStart, resolvedDeps) {
  const match = reDepencencyString.exec(stringWithDependencyIDAtStart);
  const dependencyName = match && match[2];
  if (match != null && dependencyName in resolvedDeps) {
    const {length} = match[0];
    const id = String(resolvedDeps[dependencyName]);
    return (
      padRight(id, length) +
      stringWithDependencyIDAtStart
        .slice(length)
        .replace(/$/m, ` // ${id} = ${dependencyName}`)
    );
  } else {
    return stringWithDependencyIDAtStart;
  }
}

function padRight(string, length) {
  return string.length < length
    ? string + Array(length - string.length + 1).join(' ')
    : string;
}

module.exports = Resolver;
