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

import type {
  BundlerResolution,
  TransformResultDependency,
} from '../DeltaBundler/types.flow';
import type {ResolverInputOptions} from '../shared/types.flow';
import type Package from './Package';
import type {ConfigT} from 'metro-config/src/configTypes.flow';
import type MetroFileMap, {
  ChangeEvent,
  FileSystem,
  HasteMap,
  HealthCheckResult,
  WatcherStatus,
} from 'metro-file-map';

import {DuplicateHasteCandidatesError} from 'metro-file-map';

const createFileMap = require('./DependencyGraph/createFileMap');
const {ModuleResolver} = require('./DependencyGraph/ModuleResolution');
const ModuleCache = require('./ModuleCache');
const {EventEmitter} = require('events');
const fs = require('fs');
const {
  AmbiguousModuleResolutionError,
  Logger: {createActionStartEntry, createActionEndEntry, log},
  PackageResolutionError,
} = require('metro-core');
const canonicalize = require('metro-core/src/canonicalize');
const {InvalidPackageError} = require('metro-resolver');
const nullthrows = require('nullthrows');
const path = require('path');

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
  _hasteMap: HasteMap;
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
  _initializedPromise: Promise<void>;

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
    const fileMap = createFileMap(config, {
      throwOnModuleCollision: false,
      watch,
    });

    // We can have a lot of graphs listening to Haste for changes.
    // Bump this up to silence the max listeners EventEmitter warning.
    fileMap.setMaxListeners(1000);

    this._haste = fileMap;
    this._haste.on('status', status => this._onWatcherStatus(status));

    this._initializedPromise = fileMap
      .build()
      .then(({fileSystem, hasteMap}) => {
        log(createActionEndEntry(initializingMetroLogEntry));
        config.reporter.update({type: 'dep_graph_loaded'});

        this._fileSystem = fileSystem;
        this._hasteMap = hasteMap;

        this._haste.on('change', changeEvent =>
          this._onHasteChange(changeEvent),
        );
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
    await this._initializedPromise;
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

  _onHasteChange({eventsQueue}: ChangeEvent) {
    this._resolutionCache = new Map();
    eventsQueue.forEach(({filePath}) => this._moduleCache.invalidate(filePath));
    this._createModuleResolver();
    this.emit('change');
  }

  _createModuleResolver() {
    const fileSystemLookup = (path: string) => {
      const result = this._fileSystem.lookup(path);
      if (result.exists) {
        return {
          exists: true,
          realPath: result.realPath,
          type: result.type,
        };
      }
      return {exists: false};
    };

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
      fileSystemLookup,
      getHasteModulePath: (name, platform) =>
        this._hasteMap.getModule(name, platform, true),
      getHastePackagePath: (name, platform) =>
        this._hasteMap.getPackage(name, platform, true),
      mainFields: this._config.resolver.resolverMainFields,
      moduleCache: this._moduleCache,
      nodeModulesPaths: this._config.resolver.nodeModulesPaths,
      preferNativePlatform: true,
      projectRoot: this._config.projectRoot,
      reporter: this._config.reporter,
      resolveAsset: (dirPath: string, assetName: string, extension: string) => {
        const basePath = dirPath + path.sep + assetName;
        const assets = [
          basePath + extension,
          ...this._config.resolver.assetResolutions.map(
            resolution => basePath + '@' + resolution + 'x' + extension,
          ),
        ]
          .map(assetPath => fileSystemLookup(assetPath).realPath)
          .filter(Boolean);

        return assets.length ? assets : null;
      },
      resolveRequest: this._config.resolver.resolveRequest,
      sourceExts: this._config.resolver.sourceExts,
      unstable_conditionNames: this._config.resolver.unstable_conditionNames,
      unstable_conditionsByPlatform:
        this._config.resolver.unstable_conditionsByPlatform,
      unstable_enablePackageExports:
        this._config.resolver.unstable_enablePackageExports,
    });
  }

  _getClosestPackage(
    absoluteModulePath: string,
  ): ?{packageJsonPath: string, packageRelativePath: string} {
    const result = this._fileSystem.hierarchicalLookup(
      absoluteModulePath,
      'package.json',
      {
        breakOnSegment: 'node_modules',
        invalidatedBy: null,
        subpathType: 'f',
      },
    );
    return result
      ? {
          packageJsonPath: result.absolutePath,
          packageRelativePath: result.containerRelativePath,
        }
      : null;
  }

  _createModuleCache(): ModuleCache {
    return new ModuleCache({
      getClosestPackage: absolutePath => this._getClosestPackage(absolutePath),
    });
  }

  getAllFiles(): Array<string> {
    return nullthrows(this._fileSystem).getAllFiles();
  }

  getSha1(filename: string): string {
    const sha1 = this._fileSystem.getSha1(filename);

    if (!sha1) {
      throw new ReferenceError(
        `SHA-1 for file ${filename} is not computed.
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

  async end() {
    await this.ready();
    await this._haste.end();
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
  ): Iterable<string> {
    return this._fileSystem.matchFiles({
      rootDir: from,
      recursive: context.recursive,
      filter: context.filter,
      filterComparePosix: true,
      follow: true,
    });
  }

  resolveDependency(
    from: string,
    dependency: TransformResultDependency,
    platform: string | null,
    resolverOptions: ResolverInputOptions,

    // TODO: Fold assumeFlatNodeModules into resolverOptions and add to graphId
    {assumeFlatNodeModules}: {assumeFlatNodeModules: boolean} = {
      assumeFlatNodeModules: false,
    },
  ): BundlerResolution {
    const to = dependency.name;
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
      JSON.stringify(resolverOptions ?? {}, canonicalize) ?? '';
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
          dependency,
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
