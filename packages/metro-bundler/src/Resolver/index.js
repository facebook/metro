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
const pathJoin = require('path').join;

import type ResolutionResponse from '../node-haste/DependencyGraph/ResolutionResponse';
import type Module, {HasteImpl, TransformCode} from '../node-haste/Module';
import type {MappingsMap} from '../lib/SourceMap';
import type {PostMinifyProcess} from '../Bundler';
import type {Options as JSTransformerOptions} from '../JSTransformer/worker';
import type {Reporter} from '../lib/reporting';
import type {
  TransformCache,
  GetTransformCacheKey,
} from '../lib/TransformCaching';
import type {GlobalTransformCache} from '../lib/GlobalTransformCache';

type MinifyCode = (
  filePath: string,
  code: string,
  map: ?MappingsMap,
) => Promise<{code: string, map: ?MappingsMap}>;

type ContainsTransformerOptions = {+transformer: JSTransformerOptions};

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

  getShallowDependencies(
    entryFile: string,
    transformOptions: JSTransformerOptions,
  ): Promise<Array<string>> {
    return this._depGraph.getShallowDependencies(entryFile, transformOptions);
  }

  getModuleForPath(entryFile: string): Module {
    return this._depGraph.getModuleForPath(entryFile);
  }

  async getDependencies<T: ContainsTransformerOptions>(
    entryPath: string,
    options: {
      platform: ?string,
      recursive?: boolean,
      prependPolyfills: boolean,
    },
    bundlingOptions: T,
    onProgress?: ?(finishedModules: number, totalModules: number) => mixed,
    getModuleId: mixed,
  ): Promise<ResolutionResponse<Module, T>> {
    const {platform, recursive = true, prependPolyfills} = options;

    const resolutionResponse: ResolutionResponse<
      Module,
      T,
    > = await this._depGraph.getDependencies({
      entryPath,
      platform,
      options: bundlingOptions,
      recursive,
      onProgress,
    });

    if (prependPolyfills) {
      this._getPolyfillDependencies(platform)
        .reverse()
        .forEach(polyfill => resolutionResponse.prependDependency(polyfill));
    }

    /* $FlowFixMe: monkey patching */
    resolutionResponse.getModuleId = getModuleId;
    return resolutionResponse.finalize();
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

  _getPolyfillDependencies(platform: ?string): Array<Module> {
    const polyfillModuleNames = this._getPolyfills({platform}).concat(
      this._polyfillModuleNames,
    );

    return polyfillModuleNames.map((polyfillModuleName, idx) =>
      this._depGraph.createPolyfill({
        file: polyfillModuleName,
        id: polyfillModuleName,
        dependencies: polyfillModuleNames.slice(0, idx),
      }),
    );
  }

  resolveRequires(
    module: Module,
    getModuleId: ({path: string}) => number,
    code: string,
    dependencyPairs: Map<string, string>,
    dependencyOffsets: Array<number> = [],
  ): string {
    const resolvedDeps = Object.create(null);

    // here, we build a map of all require strings (relative and absolute)
    // to the canonical ID of the module they reference
    for (const [name, path] of dependencyPairs) {
      resolvedDeps[name] = getModuleId({path});
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
    module,
    getModuleId,
    dependencyPairs,
    dependencyOffsets,
    name,
    map,
    code,
    dev = true,
  }: {
    module: Module,
    getModuleId: ({path: string}) => number,
    dependencyPairs: Map<string, string>,
    dependencyOffsets: Array<number>,
    name: string,
    map: ?MappingsMap,
    code: string,
    dev?: boolean,
  }): {code: string, map: ?MappingsMap} {
    if (module.isJSON()) {
      code = `module.exports = ${code}`;
    }

    if (module.isPolyfill()) {
      code = definePolyfillCode(code);
    } else {
      const moduleId = getModuleId(module);

      code = this.resolveRequires(
        module,
        getModuleId,
        code,
        dependencyPairs,
        dependencyOffsets,
      );
      code = defineModuleCode(moduleId, code, name, dev);
    }

    return {code, map};
  }

  async minifyModule({
    path,
    code,
    map,
  }: {
    path: string,
    code: string,
    map: ?MappingsMap,
  }): Promise<{code: string, map: ?MappingsMap}> {
    const minified = await this._minifyCode(path, code, map);
    return await this._postMinifyProcess(minified);
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
