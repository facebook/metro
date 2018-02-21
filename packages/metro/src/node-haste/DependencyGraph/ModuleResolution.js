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

const Resolver = require('metro-resolver');

const invariant = require('fbjs/lib/invariant');
const path = require('path');
const util = require('util');

import type {
  DoesFileExist,
  IsAssetFile,
  ResolveAsset,
  Resolution,
} from 'metro-resolver';

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

export type Packageish = {
  redirectRequire(toModuleName: string): string | false,
  getMain(): string,
};

export type Moduleish = {
  +path: string,
  getPackage(): ?Packageish,
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
  +dirExists: DirExistsFn,
  +doesFileExist: DoesFileExist,
  +extraNodeModules: ?Object,
  +isAssetFile: IsAssetFile,
  +moduleCache: ModuleishCache<TModule, TPackage>,
  +preferNativePlatform: boolean,
  +moduleMap: ModuleMap,
  +resolveAsset: ResolveAsset,
  +sourceExts: Array<string>,
|};

class ModuleResolver<TModule: Moduleish, TPackage: Packageish> {
  _options: Options<TModule, TPackage>;

  static EMPTY_MODULE: string = require.resolve('./assets/empty-module.js');

  constructor(options: Options<TModule, TPackage>) {
    this._options = options;
  }

  _redirectRequire(fromModule: TModule, modulePath: string): string | false {
    const pck = fromModule.getPackage();
    if (pck) {
      return pck.redirectRequire(modulePath);
    }
    return modulePath;
  }

  resolveDependency(
    fromModule: TModule,
    moduleName: string,
    allowHaste: boolean,
    platform: string | null,
  ): TModule {
    const result = Resolver.resolve(
      {
        ...this._options,
        originModulePath: fromModule.path,
        redirectModulePath: modulePath =>
          this._redirectRequire(fromModule, modulePath),
        allowHaste,
        platform,
        resolveHasteModule: name =>
          this._options.moduleMap.getModule(name, platform, true),
        resolveHastePackage: name =>
          this._options.moduleMap.getPackage(name, platform, true),
        getPackageMainPath: this._getPackageMainPath,
      },
      moduleName,
      platform,
    );
    if (result.type === 'resolved') {
      return this._getFileResolvedModule(result.resolution);
    }
    if (result.candidates.type === 'modulePath') {
      const {which} = result.candidates;
      throw new UnableToResolveError(
        fromModule.path,
        moduleName,
        `The module \`${moduleName}\` could not be found ` +
          `from \`${fromModule.path}\`. ` +
          `Indeed, none of these files exist:\n\n` +
          `  * \`${Resolver.formatFileCandidates(which.file)}\`\n` +
          `  * \`${Resolver.formatFileCandidates(which.dir)}\``,
      );
    }

    const {dirPaths, extraPaths} = result.candidates;
    const displayDirPaths = dirPaths
      .filter(dirPath => this._options.dirExists(dirPath))
      .concat(extraPaths);

    const hint = displayDirPaths.length ? ' or in these directories:' : '';
    throw new UnableToResolveError(
      fromModule.path,
      moduleName,
      `Module does not exist in the module map${hint}\n` +
        displayDirPaths
          .map(dirPath => `  ${path.dirname(dirPath)}\n`)
          .join(', ') +
        '\n' +
        `This might be related to https://github.com/facebook/react-native/issues/4968\n` +
        `To resolve try the following:\n` +
        `  1. Clear watchman watches: \`watchman watch-del-all\`.\n` +
        `  2. Delete the \`node_modules\` folder: \`rm -rf node_modules && npm install\`.\n` +
        '  3. Reset Metro Bundler cache: `rm -rf /tmp/metro-bundler-cache-*` or `npm start -- --reset-cache`.' +
        '  4. Remove haste cache: `rm -rf /tmp/haste-map-react-native-packager-*`.',
    );
  }

  _getPackageMainPath = (packageJsonPath: string): string => {
    const package_ = this._options.moduleCache.getPackage(packageJsonPath);
    return package_.getMain();
  };

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
        return this._options.moduleCache.getAssetModule(arbitrary);
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
