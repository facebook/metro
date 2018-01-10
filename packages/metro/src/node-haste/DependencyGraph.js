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

const AssetResolutionCache = require('./AssetResolutionCache');
const DependencyGraphHelpers = require('./DependencyGraph/DependencyGraphHelpers');
const FilesByDirNameIndex = require('./FilesByDirNameIndex');
const JestHasteMap = require('jest-haste-map');
const Module = require('./Module');
const ModuleCache = require('./ModuleCache');
const ResolutionRequest = require('./DependencyGraph/ResolutionRequest');

const fs = require('fs');
const isAbsolutePath = require('absolute-path');
const parsePlatformFilePath = require('./lib/parsePlatformFilePath');
const path = require('path');
const util = require('util');

const {ModuleResolver} = require('./DependencyGraph/ModuleResolution');
const {EventEmitter} = require('events');
const {
  Logger: {createActionStartEntry, createActionEndEntry, log},
} = require('metro-core');

import type {Options as JSTransformerOptions} from '../JSTransformer/worker';
import type {GlobalTransformCache} from '../lib/GlobalTransformCache';
import type {
  GetTransformCacheKey,
  TransformCache,
} from '../lib/TransformCaching';
import type {Reporter} from '../lib/reporting';
import type {ModuleMap} from './DependencyGraph/ModuleResolution';
import type {TransformCode, HasteImpl} from './Module';
import type Package from './Package';
import type {HasteFS} from './types';

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

const JEST_HASTE_MAP_CACHE_BREAKER = 1;

class DependencyGraph extends EventEmitter {
  _assetResolutionCache: AssetResolutionCache;
  _filesByDirNameIndex: FilesByDirNameIndex;
  _haste: JestHasteMap;
  _hasteFS: HasteFS;
  _helpers: DependencyGraphHelpers;
  _moduleCache: ModuleCache;
  _moduleMap: ModuleMap;
  _moduleResolver: ModuleResolver<Module, Package>;
  _opts: Options;

  constructor(config: {|
    +opts: Options,
    +haste: JestHasteMap,
    +initialHasteFS: HasteFS,
    +initialModuleMap: ModuleMap,
  |}) {
    super();
    this._opts = config.opts;
    this._filesByDirNameIndex = new FilesByDirNameIndex(
      config.initialHasteFS.getAllFiles(),
    );
    this._assetResolutionCache = new AssetResolutionCache({
      assetExtensions: new Set(config.opts.assetExts),
      getDirFiles: dirPath => this._filesByDirNameIndex.getAllFiles(dirPath),
      platforms: config.opts.platforms,
    });
    this._haste = config.haste;
    this._hasteFS = config.initialHasteFS;
    this._moduleMap = config.initialModuleMap;
    this._helpers = new DependencyGraphHelpers(this._opts);
    this._haste.on('change', this._onHasteChange.bind(this));
    this._moduleCache = this._createModuleCache();
    this._createModuleResolver();
  }

  static _createHaste(
    opts: Options,
    useWatchman?: boolean = true,
  ): JestHasteMap {
    return new JestHasteMap({
      extensions: opts.sourceExts.concat(opts.assetExts),
      forceNodeFilesystemAPI: !useWatchman,
      ignorePattern: opts.blacklistRE || / ^/,
      maxWorkers: opts.maxWorkers,
      mocksPattern: '',
      name: 'metro-' + JEST_HASTE_MAP_CACHE_BREAKER,
      platforms: Array.from(opts.platforms),
      providesModuleNodeModules: opts.providesModuleNodeModules,
      resetCache: opts.resetCache,
      retainAllFiles: true,
      roots: opts.projectRoots,
      useWatchman,
      watch: opts.watch,
    });
  }

  static _getJestHasteMapOptions(opts: Options) {}

  static async load(
    opts: Options,
    useWatchman?: boolean = true,
  ): Promise<DependencyGraph> {
    const initializingMetroLogEntry = log(
      createActionStartEntry('Initializing Metro'),
    );

    opts.reporter.update({type: 'dep_graph_loading'});
    const haste = DependencyGraph._createHaste(opts, useWatchman);
    const {hasteFS, moduleMap} = await haste.build();

    log(createActionEndEntry(initializingMetroLogEntry));
    opts.reporter.update({type: 'dep_graph_loaded'});

    return new DependencyGraph({
      haste,
      initialHasteFS: hasteFS,
      initialModuleMap: moduleMap,
      opts,
    });
  }

  _getClosestPackage(filePath: string): ?string {
    const parsedPath = path.parse(filePath);
    const root = parsedPath.root;
    let dir = parsedPath.dir;
    do {
      const candidate = path.join(dir, 'package.json');
      if (this._hasteFS.exists(candidate)) {
        return candidate;
      }
      dir = path.dirname(dir);
    } while (dir !== '.' && dir !== root);
    return null;
  }

  _onHasteChange({eventsQueue, hasteFS, moduleMap}) {
    this._hasteFS = hasteFS;
    this._filesByDirNameIndex = new FilesByDirNameIndex(hasteFS.getAllFiles());
    this._assetResolutionCache.clear();
    this._moduleMap = moduleMap;
    eventsQueue.forEach(({type, filePath}) =>
      this._moduleCache.processFileChange(type, filePath),
    );
    this._createModuleResolver();
    this.emit('change');
  }

  _createModuleResolver() {
    this._moduleResolver = new ModuleResolver({
      dirExists: filePath => {
        try {
          return fs.lstatSync(filePath).isDirectory();
        } catch (e) {}
        return false;
      },
      doesFileExist: this._doesFileExist,
      extraNodeModules: this._opts.extraNodeModules,
      isAssetFile: filePath => this._helpers.isAssetFile(filePath),
      moduleCache: this._moduleCache,
      moduleMap: this._moduleMap,
      preferNativePlatform: true,
      resolveAsset: (dirPath, assetName, platform) =>
        this._assetResolutionCache.resolve(dirPath, assetName, platform),
      sourceExts: this._opts.sourceExts,
    });
  }

  _createModuleCache() {
    const {_opts} = this;
    return new ModuleCache(
      {
        assetDependencies: [_opts.assetRegistryPath],
        depGraphHelpers: this._helpers,
        getClosestPackage: this._getClosestPackage.bind(this),
        getTransformCacheKey: _opts.getTransformCacheKey,
        globalTransformCache: _opts.globalTransformCache,
        hasteImpl: _opts.hasteImpl,
        resetCache: _opts.resetCache,
        transformCache: _opts.transformCache,
        reporter: _opts.reporter,
        roots: _opts.projectRoots,
        transformCode: _opts.transformCode,
      },
      _opts.platforms,
    );
  }

  /**
   * Returns a promise with the direct dependencies the module associated to
   * the given entryPath has.
   */
  getShallowDependencies(
    entryPath: string,
    transformOptions: JSTransformerOptions,
  ): Promise<Array<string>> {
    return this._moduleCache
      .getModule(entryPath)
      .getDependencies(transformOptions);
  }

  getWatcher() {
    return this._haste;
  }

  end() {
    this._haste.end();
  }

  getModuleForPath(entryFile: string) {
    if (this._helpers.isAssetFile(entryFile)) {
      return this._moduleCache.getAssetModule(entryFile);
    }

    return this._moduleCache.getModule(entryFile);
  }

  resolveDependency(
    fromModule: Module,
    toModuleName: string,
    platform: ?string,
  ): Module {
    const req = new ResolutionRequest({
      moduleResolver: this._moduleResolver,
      entryPath: fromModule.path,
      helpers: this._helpers,
      platform: platform || null,
      moduleCache: this._moduleCache,
    });

    return req.resolveDependency(fromModule, toModuleName);
  }

  _doesFileExist = (filePath: string): boolean => {
    return this._hasteFS.exists(filePath);
  };

  _getRequestPlatform(entryPath: string, platform: ?string): ?string {
    if (platform == null) {
      platform = parsePlatformFilePath(entryPath, this._opts.platforms)
        .platform;
    } else if (!this._opts.platforms.has(platform)) {
      throw new Error('Unrecognized platform: ' + platform);
    }
    return platform;
  }

  getAbsolutePath(filePath: string) {
    if (isAbsolutePath(filePath)) {
      return path.resolve(filePath);
    }

    for (let i = 0; i < this._opts.projectRoots.length; i++) {
      const root = this._opts.projectRoots[i];
      const potentialAbsPath = path.join(root, filePath);
      if (this._hasteFS.exists(potentialAbsPath)) {
        return path.resolve(potentialAbsPath);
      }
    }

    // If we failed to find a file, maybe this is just a Haste name so try that
    // TODO: We should prefer Haste name resolution first ideally since it is faster
    // TODO: Ideally, we should not do any `path.parse().name` here and just use the
    //       name, but in `metro/src/Server/index.js` we append `'.js'` to all names
    //       so until that changes, we have to do this.
    const potentialPath = this._moduleMap.getModule(
      path.parse(filePath).name,
      null,
    );
    if (potentialPath) {
      return potentialPath;
    }

    throw new NotFoundError(
      'Cannot find entry file %s in any of the roots: %j',
      filePath,
      this._opts.projectRoots,
    );
  }

  createPolyfill(options: {file: string}) {
    return this._moduleCache.createPolyfill(options);
  }
}

function NotFoundError(...args) {
  Error.call(this);
  Error.captureStackTrace(this, this.constructor);
  var msg = util.format.apply(util, args);
  this.message = msg;
  this.type = this.name = 'NotFoundError';
  this.status = 404;
}
util.inherits(NotFoundError, Error);

module.exports = DependencyGraph;
