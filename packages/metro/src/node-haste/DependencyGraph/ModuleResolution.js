/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

import type {ModuleMap} from 'metro-file-map';
import type {
  CustomResolver,
  DoesFileExist,
  FileCandidates,
  IsAssetFile,
  Resolution,
  ResolveAsset,
} from 'metro-resolver';

const {codeFrameColumns} = require('@babel/code-frame');
const fs = require('fs');
const invariant = require('invariant');
const Resolver = require('metro-resolver');
const path = require('path');
const util = require('util');

export type DirExistsFn = (filePath: string) => boolean;

export type Packageish = interface {
  path: string,
  redirectRequire(
    toModuleName: string,
    mainFields: $ReadOnlyArray<string>,
  ): string | false,
  getMain(mainFields: $ReadOnlyArray<string>): string,
};

export type Moduleish = interface {
  +path: string,
  getPackage(): ?Packageish,
};

export type ModuleishCache<TModule, TPackage> = interface {
  getPackage(
    name: string,
    platform?: string,
    supportsNativePlatform?: boolean,
  ): TPackage,
  getModule(path: string): TModule,
  getPackageOf(modulePath: string): ?TPackage,
};

type Options<TModule, TPackage> = {|
  +dirExists: DirExistsFn,
  +disableHierarchicalLookup: boolean,
  +doesFileExist: DoesFileExist,
  +emptyModulePath: string,
  +extraNodeModules: ?Object,
  +isAssetFile: IsAssetFile,
  +mainFields: $ReadOnlyArray<string>,
  +moduleCache: ModuleishCache<TModule, TPackage>,
  +moduleMap: ModuleMap,
  +nodeModulesPaths: $ReadOnlyArray<string>,
  +preferNativePlatform: boolean,
  +projectRoot: string,
  +resolveAsset: ResolveAsset,
  +resolveRequest: ?CustomResolver,
  +sourceExts: $ReadOnlyArray<string>,
|};

class ModuleResolver<TModule: Moduleish, TPackage: Packageish> {
  _options: Options<TModule, TPackage>;
  // A module representing the project root, used as the origin when resolving `emptyModulePath`.
  _projectRootFakeModule: Moduleish;
  // An empty module, the result of resolving `emptyModulePath` from the project root.
  _cachedEmptyModule: ?TModule;

  constructor(options: Options<TModule, TPackage>) {
    this._options = options;
    const {projectRoot, moduleCache} = this._options;
    this._projectRootFakeModule = {
      path: path.join(projectRoot, '_'),
      getPackage: () =>
        moduleCache.getPackageOf(this._projectRootFakeModule.path),
      isHaste() {
        throw new Error('not implemented');
      },
      getName() {
        throw new Error('not implemented');
      },
    };
  }

  _getEmptyModule() {
    let emptyModule = this._cachedEmptyModule;
    if (!emptyModule) {
      emptyModule = this.resolveDependency(
        this._projectRootFakeModule,
        this._options.emptyModulePath,
        false,
        null,
      );
      this._cachedEmptyModule = emptyModule;
    }
    return emptyModule;
  }

  _redirectRequire(fromModule: Moduleish, modulePath: string): string | false {
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
              path.dirname(fromPackage.path),
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
                path.resolve(path.dirname(fromPackage.path), redirectedPath),
              );
          }

          return redirectedPath;
        }
      } else {
        const pck = path.isAbsolute(modulePath)
          ? moduleCache.getPackageOf(modulePath)
          : fromModule.getPackage();

        if (pck) {
          return pck.redirectRequire(modulePath, this._options.mainFields);
        }
      }
    } catch (err) {
      // Do nothing. The standard module cache does not trigger any error, but
      // the ModuleGraph one does, if the module does not exist.
    }

    return modulePath;
  }

  resolveDependency(
    fromModule: Moduleish,
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
          resolveHasteModule: (name: string) =>
            this._options.moduleMap.getModule(name, platform, true),
          resolveHastePackage: (name: string) =>
            this._options.moduleMap.getPackage(name, platform, true),
          getPackageMainPath: this._getPackageMainPath,
        },
        moduleName,
        platform,
      );
      return this._getFileResolvedModule(result);
    } catch (error) {
      if (error instanceof Resolver.FailedToResolvePathError) {
        const {candidates} = error;
        throw new UnableToResolveError(
          fromModule.path,
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
        const dirPaths = error.dirPaths;
        const extraPaths = error.extraPaths;
        const displayDirPaths = dirPaths
          .filter((dirPath: string) => this._options.dirExists(dirPath))
          .map(dirPath => path.relative(this._options.projectRoot, dirPath))
          .concat(extraPaths);

        const hint = displayDirPaths.length ? ' or in these directories:' : '';

        throw new UnableToResolveError(
          fromModule.path,
          moduleName,
          [
            `${moduleName} could not be found within the project${hint || '.'}`,
            ...displayDirPaths.map((dirPath: string) => `  ${dirPath}`),
          ].join('\n'),
        );
      }
      throw error;
    }
  }

  _getPackageMainPath = (packageJsonPath: string): string => {
    const package_ = this._options.moduleCache.getPackage(packageJsonPath);
    return package_.getMain(this._options.mainFields);
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
        return this._options.moduleCache.getModule(arbitrary);
      case 'empty':
        return this._getEmptyModule();
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
    const codeFrameMessage = this.buildCodeFrameMessage();
    this.message =
      util.format(
        'Unable to resolve module %s from %s: %s',
        targetModuleName,
        originModulePath,
        message,
      ) + (codeFrameMessage ? '\n' + codeFrameMessage : '');
  }

  buildCodeFrameMessage(): ?string {
    let file;
    try {
      file = fs.readFileSync(this.originModulePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EISDIR') {
        // We're probably dealing with a virtualised file system where
        // `this.originModulePath` doesn't actually exist on disk.
        // We can't show a code frame, but there's no need to let this I/O
        // error shadow the original module resolution error.
        return null;
      }
      throw error;
    }

    const lines = file.split('\n');
    let lineNumber = 0;
    let column = -1;
    for (let line = 0; line < lines.length; line++) {
      const columnLocation = lines[line].lastIndexOf(this.targetModuleName);
      if (columnLocation >= 0) {
        lineNumber = line;
        column = columnLocation;
        break;
      }
    }

    return codeFrameColumns(
      fs.readFileSync(this.originModulePath, 'utf8'),
      {
        start: {column: column + 1, line: lineNumber + 1},
      },
      {forceColor: process.env.NODE_ENV !== 'test'},
    );
  }
}

module.exports = {
  ModuleResolver,
  UnableToResolveError,
};
