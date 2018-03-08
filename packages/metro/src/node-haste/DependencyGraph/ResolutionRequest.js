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

const path = require('path');

const {DuplicateHasteCandidatesError} = require('jest-haste-map').ModuleMap;
const {formatFileCandidates, InvalidPackageError} = require('metro-resolver');

import type DependencyGraphHelpers from './DependencyGraphHelpers';
import type {Options as TransformWorkerOptions} from '../../JSTransformer/worker';
import type {ReadResult, CachedReadResult} from '../Module';
import type {ModuleResolver} from './ModuleResolution';

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
  static PackageResolutionError: Class<PackageResolutionError>;

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

    const allowHaste = !this._options.helpers.isNodeModulesDir(fromModule.path);

    try {
      return cacheResult(
        resolver.resolveDependency(
          fromModule,
          toModuleName,
          allowHaste,
          platform,
        ),
      );
    } catch (error) {
      if (error instanceof DuplicateHasteCandidatesError) {
        throw new AmbiguousModuleResolutionError(fromModule.path, error);
      }
      if (error instanceof InvalidPackageError) {
        throw new PackageResolutionError({
          packageError: error,
          originModulePath: fromModule.path,
          targetModuleName: toModuleName,
        });
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

class PackageResolutionError extends Error {
  originModulePath: string;
  packageError: InvalidPackageError;
  targetModuleName: string;

  constructor(opts: {|
    +originModulePath: string,
    +packageError: InvalidPackageError,
    +targetModuleName: string,
  |}) {
    const perr = opts.packageError;
    super(
      `While trying to resolve module \`${opts.targetModuleName}\` from file ` +
        `\`${opts.originModulePath}\`, the package ` +
        `\`${perr.packageJsonPath}\` was successfully found. However, ` +
        `this package itself specifies ` +
        `a \`main\` module field that could not be resolved (` +
        `\`${perr.mainPrefixPath}\`. Indeed, none of these files exist:\n\n` +
        `  * \`${formatFileCandidates(perr.fileCandidates)}\`\n` +
        `  * \`${formatFileCandidates(perr.indexCandidates)}\``,
    );
    Object.assign(this, opts);
  }
}

ResolutionRequest.AmbiguousModuleResolutionError = AmbiguousModuleResolutionError;
ResolutionRequest.PackageResolutionError = PackageResolutionError;

module.exports = ResolutionRequest;
