/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const Resolver = require('metro-resolver');

const invariant = require('invariant');
const path = require('path');
const util = require('util');

import type {Moduleish, Packageish} from './ResolutionRequest';
import type {
  CustomResolver,
  DoesFileExist,
  FileCandidates,
  IsAssetFile,
  Resolution,
  ResolveAsset,
} from 'metro-resolver';

export type FollowFn = (filePath: string) => string;
export type DirExistsFn = (filePath: string) => boolean;

/**
 * `jest-haste-map`'s interface for ModuleMap.
 */
export type ModuleMap = {
  getModule(
    name: string,
    platform: string | null,
    supportsNativePlatform: ?boolean,
  ): ?string,
  getPackage(
    name: string,
    platform: string | null,
    supportsNativePlatform: ?boolean,
  ): ?string,
};

export type ModuleishCache<TModule, TPackage> = {
  getPackage(
    name: string,
    platform?: string,
    supportsNativePlatform?: boolean,
  ): TPackage,
  getModule(path: string): TModule,
};

type Options<TModule, TPackage> = {|
  +follow: FollowFn,
  +dirExists: DirExistsFn,
  +doesFileExist: DoesFileExist,
  +extraNodeModules: ?Object,
  +isAssetFile: IsAssetFile,
  +mainFields: $ReadOnlyArray<string>,
  +moduleCache: ModuleishCache<TModule, TPackage>,
  +projectRoot: string,
  +preferNativePlatform: boolean,
  +moduleMap: ModuleMap,
  +resolveAsset: ResolveAsset,
  +resolveRequest: ?CustomResolver,
  +sourceExts: $ReadOnlyArray<string>,
|};

class ModuleResolver<TModule: Moduleish, TPackage: Packageish> {
  _options: Options<TModule, TPackage>;

  static EMPTY_MODULE: string = require.resolve('./assets/empty-module.js');

  constructor(options: Options<TModule, TPackage>) {
    this._options = options;
  }

  _redirectRequire(fromModule: TModule, modulePath: string): string | false {
    const moduleCache = this._options.moduleCache;
    try {
      if (modulePath.startsWith('.')) {
        const fromPackage = fromModule.getPackage();

        if (fromPackage) {
          // We need to convert the module path from module-relative to
          // package-relative, so that we can easily match it against the
          // "browser" map (where all paths are relative to the package root)
          const fromPackagePath =
            './' +
            path.relative(
              fromPackage.root,
              path.resolve(path.dirname(fromModule.path), modulePath),
            );

          let redirectedPath = fromPackage.redirectRequire(
            fromPackagePath,
            this._options.mainFields,
          );

          // Since the redirected path is still relative to the package root,
          // we have to transform it back to be module-relative (as it
          // originally was)
          if (redirectedPath !== false) {
            redirectedPath =
              './' +
              path.relative(
                path.dirname(fromModule.path),
                path.resolve(fromPackage.root, redirectedPath),
              );
          }

          return redirectedPath;
        }
      } else {
        const pack = path.isAbsolute(modulePath)
          ? moduleCache.getModule(modulePath).getPackage()
          : fromModule.getPackage();

        if (pack) {
          return pack.redirectRequire(modulePath, this._options.mainFields);
        }
      }
    } catch (err) {
      // Do nothing. The standard module cache does not trigger any error, but
      // the ModuleGraph one does, if the module does not exist.
    }

    return modulePath;
  }

  resolveDependency(
    fromModule: TModule,
    moduleName: string,
    allowHaste: boolean,
    platform: string | null,
  ): TModule {
    try {
      const result = Resolver.resolve(
        {
          ...this._options,
          originModulePath: fromModule.path,
          redirectModulePath: (modulePath: string) =>
            this._redirectRequire(fromModule, modulePath),
          allowHaste,
          platform,
          resolveHasteModule(name) {
            return this.moduleMap.getModule(name, platform, true);
          },
          getPackageMainPath(packageJsonPath: string): string {
            return this.moduleCache
              .getPackage(packageJsonPath)
              .getMain(this.mainFields);
          },
          redirectPackage(packagePath: string): string {
            packagePath = this.follow(packagePath);
            const packageJsonPath = path.join(packagePath, 'package.json');
            return this.doesFileExist(packageJsonPath)
              ? this.moduleCache.getPackage(packageJsonPath).root
              : packagePath;
          },
        },
        moduleName,
        platform,
      );
      return this._getFileResolvedModule(result);
    } catch (error) {
      if (error instanceof Resolver.FailedToResolvePathError) {
        const {candidates} = error;
        throw new UnableToResolveError(
          path.relative(this._options.projectRoot, fromModule.path),
          moduleName,
          [
            '\n\nNone of these files exist:',
            `  * ${Resolver.formatFileCandidates(
              this._removeRoot(candidates.file),
            )}`,
            `  * ${Resolver.formatFileCandidates(
              this._removeRoot(candidates.dir),
            )}`,
          ].join('\n'),
        );
      }
      if (error instanceof Resolver.FailedToResolveNameError) {
        const {modulePaths} = error;
        const hint = modulePaths.length ? ' or at these locations:' : '';
        throw new UnableToResolveError(
          path.relative(this._options.projectRoot, fromModule.path),
          moduleName,
          [
            `${moduleName} could not be found within the project${hint || '.'}`,
            ...modulePaths.map(modulePath => `  ${modulePath}`),
            '\nIf you are sure the module exists, try these steps:',
            ' 1. Clear watchman watches: watchman watch-del-all',
            ' 2. Delete node_modules: rm -rf node_modules and run yarn install',
            " 3. Reset Metro's cache: yarn start --reset-cache",
            ' 4. Remove the cache: rm -rf /tmp/metro-*',
          ].join('\n'),
        );
      }
      throw error;
    }
  }

  /**
   * FIXME: get rid of this function and of the reliance on `TModule`
   * altogether, return strongly typed resolutions at the top-level instead.
   */
  _getFileResolvedModule(resolution: Resolution): TModule {
    switch (resolution.type) {
      case 'sourceFile':
        return this._options.moduleCache.getModule(resolution.filePath);
      case 'assetFiles':
        // FIXME: we should forward ALL the paths/metadata,
        // not just an arbitrary item!
        const arbitrary = getArrayLowestItem(resolution.filePaths);
        invariant(arbitrary != null, 'invalid asset resolution');
        return this._options.moduleCache.getModule(arbitrary);
      case 'empty':
        const {moduleCache} = this._options;
        const module = moduleCache.getModule(ModuleResolver.EMPTY_MODULE);
        invariant(module != null, 'empty module is not available');
        return module;
      default:
        (resolution.type: empty);
        throw new Error('invalid type');
    }
  }

  _removeRoot(candidates: FileCandidates) {
    if (candidates.filePathPrefix) {
      candidates.filePathPrefix = path.relative(
        this._options.projectRoot,
        candidates.filePathPrefix,
      );
    }
    return candidates;
  }
}

function getArrayLowestItem(a: $ReadOnlyArray<string>): string | void {
  if (a.length === 0) {
    return undefined;
  }
  let lowest = a[0];
  for (let i = 1; i < a.length; ++i) {
    if (a[i] < lowest) {
      lowest = a[i];
    }
  }
  return lowest;
}

class UnableToResolveError extends Error {
  /**
   * File path of the module that tried to require a module, ex. `/js/foo.js`.
   */
  originModulePath: string;
  /**
   * The name of the module that was required, no necessarily a path,
   * ex. `./bar`, or `invariant`.
   */
  targetModuleName: string;

  constructor(
    originModulePath: string,
    targetModuleName: string,
    message: string,
  ) {
    super();
    this.originModulePath = originModulePath;
    this.targetModuleName = targetModuleName;
    this.message = util.format(
      'Unable to resolve module `%s` from `%s`: %s',
      targetModuleName,
      originModulePath,
      message,
    );
  }
}

module.exports = {
  ModuleResolver,
  UnableToResolveError,
};
