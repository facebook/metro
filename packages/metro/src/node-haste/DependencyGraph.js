/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import type Package from './Package';
import type {ConfigT} from 'metro-config/src/configTypes.flow';
import type MetroFileMap, {
  ChangeEvent,
  FileSystem,
  IModuleMap,
  HealthCheckResult,
  WatcherStatus,
} from 'metro-file-map';

import {DuplicateHasteCandidatesError} from 'metro-file-map';

const canonicalize = require('metro-core/src/canonicalize');
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
import type {ResolverInputOptions} from '../shared/types.flow';
import type {BundlerResolution} from '../DeltaBundler/types.flow';

const NULL_PLATFORM = Symbol();

function getOrCreateMap<T>(
  map: Map<string | symbol, Map<string | symbol, T>>,
  field: string,
): Map<string | symbol, T> {
  let subMap = map.get(field);
  if (!subMap) {
    subMap = new Map();
    map.set(field, subMap);
  }
  return subMap;
}

class DependencyGraph extends EventEmitter {
  _config: ConfigT;
  _haste: MetroFileMap;
  _fileSystem: FileSystem;
  _moduleCache: ModuleCache;
  _hasteModuleMap: IModuleMap;
  _moduleResolver: ModuleResolver<Package>;
  _resolutionCache: Map<
    // Custom resolver options
    string | symbol,
    Map<
      // Origin folder
      string | symbol,
      Map<
        // Dependency name
        string | symbol,
        Map<
          // Platform
          string | symbol,
          BundlerResolution,
        >,
      >,
    >,
  >;
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
    this._haste.on('status', status => this._onWatcherStatus(status));

    this._readyPromise = haste.build().then(({fileSystem, hasteModuleMap}) => {
      log(createActionEndEntry(initializingMetroLogEntry));
      config.reporter.update({type: 'dep_graph_loaded'});

      this._fileSystem = fileSystem;
      this._hasteModuleMap = hasteModuleMap;

      this._haste.on('change', changeEvent => this._onHasteChange(changeEvent));
      this._haste.on('healthCheck', result =>
        this._onWatcherHealthCheck(result),
      );
      this._resolutionCache = new Map();
      this._moduleCache = this._createModuleCache();
      this._createModuleResolver();
    });
  }

  _onWatcherHealthCheck(result: HealthCheckResult) {
    this._config.reporter.update({type: 'watcher_health_check_result', result});
  }

  _onWatcherStatus(status: WatcherStatus) {
    this._config.reporter.update({type: 'watcher_status', status});
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
    let dir = path.join(parsedPath.dir, parsedPath.base);

    do {
      // If we've hit a node_modules directory, the closest package was not
      // found (`filePath` was likely nonexistent).
      if (path.basename(dir) === 'node_modules') {
        return null;
      }
      const candidate = path.join(dir, 'package.json');
      if (this._fileSystem.exists(candidate)) {
        return candidate;
      }
      dir = path.dirname(dir);
    } while (dir !== '.' && dir !== root);
    return null;
  }

  _onHasteChange({eventsQueue}: ChangeEvent) {
    this._resolutionCache = new Map();
    eventsQueue.forEach(({filePath}) => this._moduleCache.invalidate(filePath));
    this._createModuleResolver();
    this.emit('change');
  }

  _createModuleResolver() {
    this._moduleResolver = new ModuleResolver({
      assetExts: new Set(this._config.resolver.assetExts),
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
      getHasteModulePath: (name, platform) =>
        this._hasteModuleMap.getModule(name, platform, true),
      getHastePackagePath: (name, platform) =>
        this._hasteModuleMap.getPackage(name, platform, true),
      mainFields: this._config.resolver.resolverMainFields,
      moduleCache: this._moduleCache,
      nodeModulesPaths: this._config.resolver.nodeModulesPaths,
      preferNativePlatform: true,
      projectRoot: this._config.projectRoot,
      reporter: this._config.reporter,
      resolveAsset: (dirPath: string, assetName: string, extension: string) => {
        const basePath = dirPath + path.sep + assetName;
        let assets = [
          basePath + extension,
          ...this._config.resolver.assetResolutions.map(
            resolution => basePath + '@' + resolution + 'x' + extension,
          ),
        ];

        if (this._config.resolver.unstable_enableSymlinks) {
          assets = assets
            .map(candidate => this._fileSystem.getRealPath(candidate))
            .filter(Boolean);
        } else {
          assets = assets.filter(candidate =>
            this._fileSystem.exists(candidate),
          );
        }

        return assets.length ? assets : null;
      },
      resolveRequest: this._config.resolver.resolveRequest,
      sourceExts: this._config.resolver.sourceExts,
      unstable_conditionNames: this._config.resolver.unstable_conditionNames,
      unstable_conditionsByPlatform:
        this._config.resolver.unstable_conditionsByPlatform,
      unstable_enablePackageExports:
        this._config.resolver.unstable_enablePackageExports,
      unstable_getRealPath: this._config.resolver.unstable_enableSymlinks
        ? path => this._fileSystem.getRealPath(path)
        : null,
    });
  }

  _createModuleCache(): ModuleCache {
    return new ModuleCache({
      getClosestPackage: filePath => this._getClosestPackage(filePath),
    });
  }

  getAllFiles(): Array<string> {
    return nullthrows(this._fileSystem).getAllFiles();
  }

  getSha1(filename: string): string {
    // TODO If it looks like we're trying to get the sha1 from a file located
    // within a Zip archive, then we instead compute the sha1 for what looks
    // like the Zip archive itself.

    const splitIndex = filename.indexOf('.zip/');
    const containerName =
      splitIndex !== -1 ? filename.slice(0, splitIndex + 4) : filename;

    // Prior to unstable_enableSymlinks:
    // Calling realpath allows us to get a hash for a given path even when
    // it's a symlink to a file, which prevents Metro from crashing in such a
    // case. However, it doesn't allow Metro to track changes to the target file
    // of the symlink. We should fix this by implementing a symlink map into
    // Metro (or maybe by implementing those "extra transformation sources" we've
    // been talking about for stuff like CSS or WASM).
    //
    // This is unnecessary with a symlink-aware fileSystem implementation.
    const resolvedPath = this._config.resolver.unstable_enableSymlinks
      ? containerName
      : fs.realpathSync(containerName);

    const sha1 = this._fileSystem.getSha1(resolvedPath);

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
    // $FlowFixMe[unused-promise]
    this._haste.end();
  }

  /** Given a search context, return a list of file paths matching the query. */
  matchFilesWithContext(
    from: string,
    context: $ReadOnly<{
      /* Should search for files recursively. */
      recursive: boolean,
      /* Filter relative paths against a pattern. */
      filter: RegExp,
    }>,
  ): string[] {
    return this._fileSystem.matchFilesWithContext(from, context);
  }

  resolveDependency(
    from: string,
    to: string,
    platform: string | null,
    resolverOptions: ResolverInputOptions,

    // TODO: Fold assumeFlatNodeModules into resolverOptions and add to graphId
    {assumeFlatNodeModules}: {assumeFlatNodeModules: boolean} = {
      assumeFlatNodeModules: false,
    },
  ): BundlerResolution {
    const isSensitiveToOriginFolder =
      // Resolution is always relative to the origin folder unless we assume a flat node_modules
      !assumeFlatNodeModules ||
      // Path requests are resolved relative to the origin folder
      to.includes('/') ||
      to === '.' ||
      to === '..' ||
      // Preserve standard assumptions under node_modules
      from.includes(path.sep + 'node_modules' + path.sep);

    // Compound key for the resolver cache
    const resolverOptionsKey =
      JSON.stringify(
        resolverOptions.customResolverOptions ?? {},
        canonicalize,
      ) ?? '';
    const originKey = isSensitiveToOriginFolder ? path.dirname(from) : '';
    const targetKey = to;
    const platformKey = platform ?? NULL_PLATFORM;

    // Traverse the resolver cache, which is a tree of maps
    const mapByResolverOptions = this._resolutionCache;
    const mapByOrigin = getOrCreateMap(
      mapByResolverOptions,
      resolverOptionsKey,
    );
    const mapByTarget = getOrCreateMap(mapByOrigin, originKey);
    const mapByPlatform = getOrCreateMap(mapByTarget, targetKey);
    let resolution: ?BundlerResolution = mapByPlatform.get(platformKey);

    if (!resolution) {
      try {
        resolution = this._moduleResolver.resolveDependency(
          this._moduleCache.getModule(from),
          to,
          true,
          platform,
          resolverOptions,
        );
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

    mapByPlatform.set(platformKey, resolution);
    return resolution;
  }

  _doesFileExist = (filePath: string): boolean => {
    return this._fileSystem.exists(filePath);
  };

  getHasteName(filePath: string): string {
    const hasteName = this._fileSystem.getModuleName(filePath);

    if (hasteName) {
      return hasteName;
    }

    return path.relative(this._config.projectRoot, filePath);
  }

  getDependencies(filePath: string): Array<string> {
    return nullthrows(this._fileSystem.getDependencies(filePath));
  }
}

module.exports = DependencyGraph;
