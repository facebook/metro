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

const AssetResolutionCache = require('./AssetResolutionCache');
const DependencyGraphHelpers = require('./DependencyGraph/DependencyGraphHelpers');
const FilesByDirNameIndex = require('./FilesByDirNameIndex');
const JestHasteMap = require('jest-haste-map');
const Module = require('./Module');
const ModuleCache = require('./ModuleCache');
const ResolutionRequest = require('./DependencyGraph/ResolutionRequest');

const fs = require('fs');
const path = require('path');
const toLocalPath = require('../node-haste/lib/toLocalPath');

const {ModuleResolver} = require('./DependencyGraph/ModuleResolution');
const {EventEmitter} = require('events');
const {
  Logger: {createActionStartEntry, createActionEndEntry, log},
} = require('metro-core');

import type {Reporter} from '../lib/reporting';
import type {ModuleMap} from './DependencyGraph/ModuleResolution';
import type Package from './Package';
import type {HasteFS} from './types';
import type {CustomResolver} from 'metro-resolver';

type Options = {|
  +assetExts: Array<string>,
  +blacklistRE?: RegExp,
  +extraNodeModules: ?{},
  +hasteImplModulePath?: string,
  +maxWorkers: number,
  +platforms: Set<string>,
  +projectRoots: $ReadOnlyArray<string>,
  +providesModuleNodeModules: Array<string>,
  +reporter: Reporter,
  +resolveRequest: ?CustomResolver,
  +sourceExts: Array<string>,
  +watch: boolean,
|};

const JEST_HASTE_MAP_CACHE_BREAKER = 3;

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
      computeSha1: true,
      extensions: opts.sourceExts.concat(opts.assetExts),
      forceNodeFilesystemAPI: !useWatchman,
      hasteImplModulePath: opts.hasteImplModulePath,
      ignorePattern: opts.blacklistRE || / ^/,
      maxWorkers: opts.maxWorkers,
      mocksPattern: '',
      name: 'metro-' + JEST_HASTE_MAP_CACHE_BREAKER,
      platforms: Array.from(opts.platforms),
      providesModuleNodeModules: opts.providesModuleNodeModules,
      retainAllFiles: true,
      roots: opts.projectRoots,
      throwOnModuleCollision: true,
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
      resolveRequest: this._opts.resolveRequest,
      sourceExts: this._opts.sourceExts,
    });
  }

  _createModuleCache() {
    const {_opts} = this;
    return new ModuleCache({
      getClosestPackage: this._getClosestPackage.bind(this),
    });
  }

  getSha1(filename: string): string {
    const sha1 = this._hasteFS.getSha1(filename);

    if (!sha1) {
      throw new ReferenceError(`SHA-1 for file ${filename} is not computed`);
    }

    return sha1;
  }

  getWatcher() {
    return this._haste;
  }

  end() {
    this._haste.end();
  }

  resolveDependency(from: string, to: string, platform: ?string): string {
    const req = new ResolutionRequest({
      moduleResolver: this._moduleResolver,
      entryPath: from,
      helpers: this._helpers,
      platform: platform || null,
      moduleCache: this._moduleCache,
    });

    return req.resolveDependency(this._moduleCache.getModule(from), to).path;
  }

  _doesFileExist = (filePath: string): boolean => {
    return this._hasteFS.exists(filePath);
  };

  getHasteName(filePath: string): string {
    const hasteName = this._hasteFS.getModuleName(filePath);

    if (hasteName) {
      return hasteName;
    }

    return toLocalPath(this._opts.projectRoots, filePath);
  }
}

module.exports = DependencyGraph;
