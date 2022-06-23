/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

import type Package from './Package';
import type {ConfigT} from 'metro-config/src/configTypes.flow';
import type MetroFileMap, {HasteFS} from 'metro-file-map';
import type Module from './Module';

import {ModuleMap as MetroFileMapModuleMap} from 'metro-file-map';

const createHasteMap = require('./DependencyGraph/createHasteMap');
const {ModuleResolver} = require('./DependencyGraph/ModuleResolution');
const ModuleCache = require('./ModuleCache');
const {EventEmitter} = require('events');
const fs = require('fs');
const {
  AmbiguousModuleResolutionError,
  Logger: {createActionStartEntry, createActionEndEntry, log},
  PackageResolutionError,
} = require('metro-core');
const {InvalidPackageError} = require('metro-resolver');
const nullthrows = require('nullthrows');
const path = require('path');

const {DuplicateHasteCandidatesError} = MetroFileMapModuleMap;

function getOrCreate<T>(
  map: Map<string, Map<string, T>>,
  field: string,
): Map<string, T> {
  let subMap = map.get(field);
  if (!subMap) {
    subMap = new Map();
    map.set(field, subMap);
  }
  return subMap;
}

class DependencyGraph extends EventEmitter {
  _assetExtensions: Set<string>;
  _config: ConfigT;
  _haste: MetroFileMap;
  _hasteFS: HasteFS;
  _moduleCache: ModuleCache;
  _moduleMap: MetroFileMapModuleMap;
  _moduleResolver: ModuleResolver<Module, Package>;
  _resolutionCache: Map<string, Map<string, Map<string, string>>>;
  _readyPromise: Promise<void>;

  constructor(
    config: ConfigT,
    options?: {
      +hasReducedPerformance?: boolean,
      +watch?: boolean,
    },
  ) {
    super();

    this._config = config;
    this._assetExtensions = new Set(
      config.resolver.assetExts.map(asset => '.' + asset),
    );

    const {hasReducedPerformance, watch} = options ?? {};
    const initializingMetroLogEntry = log(
      createActionStartEntry('Initializing Metro'),
    );

    config.reporter.update({
      type: 'dep_graph_loading',
      hasReducedPerformance: !!hasReducedPerformance,
    });
    const haste = createHasteMap(config, {watch});

    // We can have a lot of graphs listening to Haste for changes.
    // Bump this up to silence the max listeners EventEmitter warning.
    haste.setMaxListeners(1000);

    this._haste = haste;

    this._readyPromise = haste.build().then(({hasteFS, moduleMap}) => {
      log(createActionEndEntry(initializingMetroLogEntry));
      config.reporter.update({type: 'dep_graph_loaded'});

      this._hasteFS = hasteFS;
      this._moduleMap = moduleMap;

      // $FlowFixMe[method-unbinding] added when improving typing for this parameters
      this._haste.on('change', this._onHasteChange.bind(this));
      this._resolutionCache = new Map();
      this._moduleCache = this._createModuleCache();
      this._createModuleResolver();
    });
  }

  // Waits for the dependency graph to become ready after initialisation.
  // Don't read anything from the graph until this resolves.
  async ready(): Promise<void> {
    await this._readyPromise;
  }

  // Creates the dependency graph and waits for it to become ready.
  // @deprecated Use the constructor + ready() directly.
  static async load(
    config: ConfigT,
    options?: {+hasReducedPerformance?: boolean, +watch?: boolean},
  ): Promise<DependencyGraph> {
    const self = new DependencyGraph(config, options);
    await self.ready();
    return self;
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

  /* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
   * LTI update could not be added via codemod */
  _onHasteChange({eventsQueue, hasteFS, moduleMap}) {
    this._hasteFS = hasteFS;
    this._resolutionCache = new Map();
    this._moduleMap = moduleMap;
    eventsQueue.forEach(({type, filePath}) =>
      this._moduleCache.processFileChange(type, filePath),
    );
    this._createModuleResolver();
    this.emit('change');
  }

  _createModuleResolver() {
    this._moduleResolver = new ModuleResolver({
      dirExists: (filePath: string) => {
        try {
          return fs.lstatSync(filePath).isDirectory();
        } catch (e) {}
        return false;
      },
      disableHierarchicalLookup:
        this._config.resolver.disableHierarchicalLookup,
      doesFileExist: this._doesFileExist,
      emptyModulePath: this._config.resolver.emptyModulePath,
      extraNodeModules: this._config.resolver.extraNodeModules,
      isAssetFile: file => this._assetExtensions.has(path.extname(file)),
      mainFields: this._config.resolver.resolverMainFields,
      moduleCache: this._moduleCache,
      moduleMap: this._moduleMap,
      nodeModulesPaths: this._config.resolver.nodeModulesPaths,
      preferNativePlatform: true,
      projectRoot: this._config.projectRoot,
      resolveAsset: (dirPath: string, assetName: string, extension: string) => {
        const basePath = dirPath + path.sep + assetName;
        const assets = [
          basePath + extension,
          ...this._config.resolver.assetResolutions.map(
            resolution => basePath + '@' + resolution + 'x' + extension,
          ),
        ].filter(candidate => this._hasteFS.exists(candidate));
        return assets.length ? assets : null;
      },
      resolveRequest: this._config.resolver.resolveRequest,
      sourceExts: this._config.resolver.sourceExts,
    });
  }

  _createModuleCache() {
    return new ModuleCache({
      // $FlowFixMe[method-unbinding] added when improving typing for this parameters
      getClosestPackage: this._getClosestPackage.bind(this),
    });
  }

  getSha1(filename: string): string {
    // TODO If it looks like we're trying to get the sha1 from a file located
    // within a Zip archive, then we instead compute the sha1 for what looks
    // like the Zip archive itself.

    const splitIndex = filename.indexOf('.zip/');
    const containerName =
      splitIndex !== -1 ? filename.slice(0, splitIndex + 4) : filename;

    // TODO Calling realpath allows us to get a hash for a given path even when
    // it's a symlink to a file, which prevents Metro from crashing in such a
    // case. However, it doesn't allow Metro to track changes to the target file
    // of the symlink. We should fix this by implementing a symlink map into
    // Metro (or maybe by implementing those "extra transformation sources" we've
    // been talking about for stuff like CSS or WASM).

    const resolvedPath = fs.realpathSync(containerName);
    const sha1 = this._hasteFS.getSha1(resolvedPath);

    if (!sha1) {
      throw new ReferenceError(
        `SHA-1 for file ${filename} (${resolvedPath}) is not computed.
         Potential causes:
           1) You have symlinks in your project - watchman does not follow symlinks.
           2) Check \`blockList\` in your metro.config.js and make sure it isn't excluding the file path.`,
      );
    }

    return sha1;
  }

  getWatcher(): EventEmitter {
    return this._haste;
  }

  end() {
    this._haste.end();
  }

  resolveDependency(
    from: string,
    to: string,
    platform: string,
    {assumeFlatNodeModules}: {assumeFlatNodeModules: boolean} = {
      assumeFlatNodeModules: false,
    },
  ): string {
    const isSensitiveToOriginFolder =
      // Resolution is always relative to the origin folder unless we assume a flat node_modules
      !assumeFlatNodeModules ||
      // Path requests are resolved relative to the origin folder
      to.includes('/') ||
      to === '.' ||
      to === '..' ||
      // Preserve standard assumptions under node_modules
      from.includes(path.sep + 'node_modules' + path.sep);
    const mapByDirectory = getOrCreate(
      this._resolutionCache,
      isSensitiveToOriginFolder ? path.dirname(from) : '',
    );
    const mapByPlatform = getOrCreate(mapByDirectory, to);
    let modulePath = mapByPlatform.get(platform);

    if (!modulePath) {
      try {
        modulePath = this._moduleResolver.resolveDependency(
          this._moduleCache.getModule(from),
          to,
          true,
          platform,
        ).path;
      } catch (error) {
        if (error instanceof DuplicateHasteCandidatesError) {
          throw new AmbiguousModuleResolutionError(from, error);
        }
        if (error instanceof InvalidPackageError) {
          throw new PackageResolutionError({
            packageError: error,
            originModulePath: from,
            targetModuleName: to,
          });
        }
        throw error;
      }
    }

    mapByPlatform.set(platform, modulePath);
    return modulePath;
  }

  _doesFileExist = (filePath: string): boolean => {
    return this._hasteFS.exists(filePath);
  };

  getHasteName(filePath: string): string {
    const hasteName = this._hasteFS.getModuleName(filePath);

    if (hasteName) {
      return hasteName;
    }

    return path.relative(this._config.projectRoot, filePath);
  }

  getDependencies(filePath: string): Array<string> {
    return nullthrows(this._hasteFS.getDependencies(filePath));
  }
}

module.exports = DependencyGraph;
