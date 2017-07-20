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

const AsyncTaskGroup = require('../lib/AsyncTaskGroup');
const MapWithDefaults = require('../lib/MapWithDefaults');
const ModuleResolution = require('./ModuleResolution');

const debug = require('debug')('Metro:DependencyGraph');
const isAbsolutePath = require('absolute-path');
const path = require('path');

const {
  DuplicateHasteCandidatesError,
} = require('jest-haste-map/build/module_map');

import type DependencyGraphHelpers from './DependencyGraphHelpers';
import type ResolutionResponse from './ResolutionResponse';
import type {Options as TransformWorkerOptions} from '../../JSTransformer/worker';
import type {ReadResult, CachedReadResult} from '../Module';
import type {ModuleResolver} from './ModuleResolution';

const {UnableToResolveError, isRelativeImport} = ModuleResolution;

export type Packageish = {
  isHaste(): boolean,
  getName(): Promise<string>,
  path: string,
  redirectRequire(toModuleName: string): string | false,
  getMain(): string,
  +root: string,
};

export type Moduleish = {
  +path: string,
  isHaste(): boolean,
  getName(): Promise<string>,
  getPackage(): ?Packageish,
  hash(): string,
  readCached(transformOptions: TransformWorkerOptions): CachedReadResult,
  readFresh(transformOptions: TransformWorkerOptions): Promise<ReadResult>,
};

export type ModuleishCache<TModule, TPackage> = {
  getPackage(
    name: string,
    platform?: string,
    supportsNativePlatform?: boolean,
  ): TPackage,
  getModule(path: string): TModule,
  getAssetModule(path: string): TModule,
};

type Options<TModule, TPackage> = {|
  +entryPath: string,
  +helpers: DependencyGraphHelpers,
  +moduleCache: ModuleishCache<TModule, TPackage>,
  +moduleResolver: ModuleResolver<TModule, TPackage>,
  +platform: string | null,
|};

class ResolutionRequest<TModule: Moduleish, TPackage: Packageish> {
  _immediateResolutionCache: {[key: string]: TModule};
  _options: Options<TModule, TPackage>;
  static AmbiguousModuleResolutionError: Class<AmbiguousModuleResolutionError>;

  constructor(options: Options<TModule, TPackage>) {
    this._options = options;
    this._resetResolutionCache();
  }

  resolveDependency(fromModule: TModule, toModuleName: string): TModule {
    const resHash = resolutionHash(fromModule.path, toModuleName);

    const immediateResolution = this._immediateResolutionCache[resHash];
    if (immediateResolution) {
      return immediateResolution;
    }

    const cacheResult = result => {
      this._immediateResolutionCache[resHash] = result;
      return result;
    };

    const resolver = this._options.moduleResolver;
    const platform = this._options.platform;

    if (
      !this._options.helpers.isNodeModulesDir(fromModule.path) &&
      !(isRelativeImport(toModuleName) || isAbsolutePath(toModuleName))
    ) {
      const result = ModuleResolution.tryResolveSync(
        () => this._resolveHasteDependency(fromModule, toModuleName, platform),
        () =>
          resolver.resolveNodeDependency(fromModule, toModuleName, platform),
      );
      return cacheResult(result);
    }

    return cacheResult(
      resolver.resolveNodeDependency(fromModule, toModuleName, platform),
    );
  }

  _resolveHasteDependency(
    fromModule: TModule,
    toModuleName: string,
    platform: string | null,
  ): TModule {
    const rs = this._options.moduleResolver;
    try {
      return rs.resolveHasteDependency(fromModule, toModuleName, platform);
    } catch (error) {
      if (error instanceof DuplicateHasteCandidatesError) {
        throw new AmbiguousModuleResolutionError(fromModule.path, error);
      }
      throw error;
    }
  }

  resolveModuleDependencies(
    module: TModule,
    dependencyNames: $ReadOnlyArray<string>,
  ): [$ReadOnlyArray<string>, $ReadOnlyArray<TModule>] {
    const dependencies = dependencyNames.map(name =>
      this.resolveDependency(module, name),
    );
    return [dependencyNames, dependencies];
  }

  getOrderedDependencies<T>({
    response,
    transformOptions,
    onProgress,
    recursive = true,
  }: {
    response: ResolutionResponse<TModule, T>,
    transformOptions: TransformWorkerOptions,
    onProgress?: ?(finishedModules: number, totalModules: number) => mixed,
    recursive: boolean,
  }) {
    const entry = this._options.moduleCache.getModule(this._options.entryPath);

    response.pushDependency(entry);
    let totalModules = 1;
    let finishedModules = 0;

    let preprocessedModuleCount = 1;
    if (recursive) {
      this._preprocessPotentialDependencies(transformOptions, entry, count => {
        if (count + 1 <= preprocessedModuleCount) {
          return;
        }
        preprocessedModuleCount = count + 1;
        if (onProgress != null) {
          onProgress(finishedModules, preprocessedModuleCount);
        }
      });
    }

    const resolveDependencies = (module: TModule) =>
      Promise.resolve().then(() => {
        const cached = module.readCached(transformOptions);
        if (cached.result != null) {
          return this.resolveModuleDependencies(
            module,
            cached.result.dependencies,
          );
        }
        return module
          .readFresh(transformOptions)
          .then(({dependencies}) =>
            this.resolveModuleDependencies(module, dependencies),
          );
      });

    const collectedDependencies: MapWithDefaults<
      TModule,
      Promise<Array<TModule>>,
    > = new MapWithDefaults(module => collect(module));
    const crawlDependencies = (mod, [depNames, dependencies]) => {
      const filteredPairs = [];

      dependencies.forEach((modDep, i) => {
        const name = depNames[i];
        if (modDep == null) {
          debug(
            'WARNING: Cannot find required module `%s` from module `%s`',
            name,
            mod.path,
          );
          return false;
        }
        return filteredPairs.push([name, modDep]);
      });

      response.setResolvedDependencyPairs(mod, filteredPairs);

      const dependencyModules = filteredPairs.map(([, m]) => m);
      const newDependencies = dependencyModules.filter(
        m => !collectedDependencies.has(m),
      );

      if (onProgress) {
        finishedModules += 1;
        totalModules += newDependencies.length;
        onProgress(
          finishedModules,
          Math.max(totalModules, preprocessedModuleCount),
        );
      }

      if (recursive) {
        // doesn't block the return of this function invocation, but defers
        // the resulution of collectionsInProgress.done.then(...)
        dependencyModules.forEach(dependency =>
          collectedDependencies.get(dependency),
        );
      }
      return dependencyModules;
    };

    const collectionsInProgress = new AsyncTaskGroup();
    function collect(module) {
      collectionsInProgress.start(module);
      const result = resolveDependencies(module).then(deps =>
        crawlDependencies(module, deps),
      );
      const end = () => collectionsInProgress.end(module);
      result.then(end, end);
      return result;
    }

    function resolveKeyWithPromise(
      [key: TModule, promise: Promise<Array<TModule>>],
    ): Promise<[TModule, Array<TModule>]> {
      return promise.then(value => [key, value]);
    }

    return Promise.all([
      // kicks off recursive dependency discovery, but doesn't block until it's
      // done
      collectedDependencies.get(entry),

      // resolves when there are no more modules resolving dependencies
      collectionsInProgress.done,
    ])
      .then(([rootDependencies]) => {
        return Promise.all(
          Array.from(collectedDependencies, resolveKeyWithPromise),
        ).then(moduleToDependenciesPairs => [
          rootDependencies,
          new MapWithDefaults(() => [], moduleToDependenciesPairs),
        ]);
      })
      .then(([rootDependencies, moduleDependencies]) => {
        // serialize dependencies, and make sure that every single one is only
        // included once
        const seen = new Set([entry]);
        function traverse(dependencies) {
          dependencies.forEach(dependency => {
            if (seen.has(dependency)) {
              return;
            }

            seen.add(dependency);
            response.pushDependency(dependency);
            traverse(moduleDependencies.get(dependency));
          });
        }

        traverse(rootDependencies);
      });
  }

  /**
   * This synchronously look at all the specified modules and recursively kicks
   * off global cache fetching or transforming (via `readFresh`). This is a hack
   * that workaround the current structure, because we could do better. First
   * off, the algorithm that resolves dependencies recursively should be
   * synchronous itself until it cannot progress anymore (and needs to call
   * `readFresh`), so that this algo would be integrated into it.
   */
  _preprocessPotentialDependencies(
    transformOptions: TransformWorkerOptions,
    module: TModule,
    onProgress: (moduleCount: number) => mixed,
  ): void {
    const visitedModulePaths = new Set();
    const pendingBatches = [
      this.preprocessModule(transformOptions, module, visitedModulePaths),
    ];
    onProgress(visitedModulePaths.size);
    while (pendingBatches.length > 0) {
      const dependencyModules = pendingBatches.pop();
      while (dependencyModules.length > 0) {
        const dependencyModule = dependencyModules.pop();
        const deps = this.preprocessModule(
          transformOptions,
          dependencyModule,
          visitedModulePaths,
        );
        pendingBatches.push(deps);
        onProgress(visitedModulePaths.size);
      }
    }
  }

  preprocessModule(
    transformOptions: TransformWorkerOptions,
    module: TModule,
    visitedModulePaths: Set<string>,
  ): Array<TModule> {
    const cached = module.readCached(transformOptions);
    if (cached.result == null) {
      module.readFresh(transformOptions).catch(error => {
        /* ignore errors, they'll be handled later if the dependency is actually
         * not obsolete, and required from somewhere */
      });
    }
    const dependencies =
      cached.result != null
        ? cached.result.dependencies
        : cached.outdatedDependencies;
    return this.tryResolveModuleDependencies(
      module,
      dependencies,
      visitedModulePaths,
    );
  }

  tryResolveModuleDependencies(
    module: TModule,
    dependencyNames: $ReadOnlyArray<string>,
    visitedModulePaths: Set<string>,
  ): Array<TModule> {
    const result = [];
    for (let i = 0; i < dependencyNames.length; ++i) {
      try {
        const depModule = this.resolveDependency(module, dependencyNames[i]);
        if (!visitedModulePaths.has(depModule.path)) {
          visitedModulePaths.add(depModule.path);
          result.push(depModule);
        }
      } catch (error) {
        if (!(error instanceof UnableToResolveError)) {
          throw error;
        }
      }
    }
    return result;
  }

  _resetResolutionCache() {
    this._immediateResolutionCache = Object.create(null);
  }
}

function resolutionHash(modulePath, depName) {
  return `${path.resolve(modulePath)}:${depName}`;
}

class AmbiguousModuleResolutionError extends Error {
  fromModulePath: string;
  hasteError: DuplicateHasteCandidatesError;

  constructor(
    fromModulePath: string,
    hasteError: DuplicateHasteCandidatesError,
  ) {
    super();
    this.fromModulePath = fromModulePath;
    this.hasteError = hasteError;
  }
}

ResolutionRequest.AmbiguousModuleResolutionError = AmbiguousModuleResolutionError;

module.exports = ResolutionRequest;
