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

const ModuleResolution = require('./ModuleResolution');

const isAbsolutePath = require('absolute-path');
const path = require('path');

const {DuplicateHasteCandidatesError} = require('jest-haste-map').ModuleMap;

import type DependencyGraphHelpers from './DependencyGraphHelpers';
import type {Options as TransformWorkerOptions} from '../../JSTransformer/worker';
import type {ReadResult, CachedReadResult} from '../Module';
import type {ModuleResolver} from './ModuleResolution';

const {isRelativeImport} = ModuleResolution;

export type Packageish = {
  isHaste(): boolean,
  getName(): string,
  path: string,
  redirectRequire(toModuleName: string): string | false,
  getMain(): string,
  +root: string,
};

export type Moduleish = {
  +path: string,
  isHaste(): boolean,
  getName(): string,
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
  _immediateResolutionCache: {[key: string]: TModule, __proto__: null};
  _options: Options<TModule, TPackage>;
  static AmbiguousModuleResolutionError: Class<AmbiguousModuleResolutionError>;

  constructor(options: Options<TModule, TPackage>) {
    this._options = options;
    this._resetResolutionCache();
  }

  resolveDependency(fromModule: TModule, toModuleName: string): TModule {
    const resHash = getResolutionCacheKey(fromModule.path, toModuleName);

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
      isAbsolutePath(toModuleName) ||
      isRelativeImport(toModuleName) ||
      this._options.helpers.isNodeModulesDir(fromModule.path)
    ) {
      return cacheResult(
        resolver.resolveNodeDependency(fromModule, toModuleName, platform),
      );
    }

    return cacheResult(
      ModuleResolution.tryResolveSync(
        () => this._resolveHasteDependency(fromModule, toModuleName, platform),
        () =>
          resolver.resolveNodeDependency(fromModule, toModuleName, platform),
      ),
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

  _resetResolutionCache() {
    this._immediateResolutionCache = Object.create(null);
  }

  getResolutionCache(): {[key: string]: TModule, __proto__: null} {
    return this._immediateResolutionCache;
  }
}

function getResolutionCacheKey(modulePath, depName) {
  return `${path.resolve(modulePath)}:${depName}`;
}

class AmbiguousModuleResolutionError extends Error {
  fromModulePath: string;
  hasteError: DuplicateHasteCandidatesError;

  constructor(
    fromModulePath: string,
    hasteError: DuplicateHasteCandidatesError,
  ) {
    super(
      `Ambiguous module resolution from \`${fromModulePath}\`: ` +
        hasteError.message,
    );
    this.fromModulePath = fromModulePath;
    this.hasteError = hasteError;
  }
}

ResolutionRequest.AmbiguousModuleResolutionError = AmbiguousModuleResolutionError;

module.exports = ResolutionRequest;
