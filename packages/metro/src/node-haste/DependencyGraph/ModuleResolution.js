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

'use strict';

import type {
  CustomResolver,
  DoesFileExist,
  FileCandidates,
  GetRealPath,
  Resolution,
  ResolveAsset,
} from 'metro-resolver';
import type {ResolverInputOptions} from '../../shared/types.flow';
import type {PackageInfo, PackageJson} from 'metro-resolver/src/types';

const {codeFrameColumns} = require('@babel/code-frame');
const fs = require('fs');
const invariant = require('invariant');
const Resolver = require('metro-resolver');
const createDefaultContext = require('metro-resolver/src/createDefaultContext');
const path = require('path');
const util = require('util');
import type {
  BundlerResolution,
  TransformResultDependency,
} from '../../DeltaBundler/types.flow';
import type {Reporter} from '../../lib/reporting';

export type DirExistsFn = (filePath: string) => boolean;

export type Packageish = interface {
  path: string,
  read(): PackageJson,
};

export type Moduleish = interface {
  +path: string,
  getPackage(): ?Packageish,
};

export type ModuleishCache<TPackage> = interface {
  getPackage(
    name: string,
    platform?: string,
    supportsNativePlatform?: boolean,
  ): TPackage,
  getPackageOf(modulePath: string): ?TPackage,
};

type Options<TPackage> = $ReadOnly<{
  assetExts: $ReadOnlySet<string>,
  dirExists: DirExistsFn,
  disableHierarchicalLookup: boolean,
  doesFileExist: DoesFileExist,
  emptyModulePath: string,
  extraNodeModules: ?Object,
  getHasteModulePath: (name: string, platform: ?string) => ?string,
  getHastePackagePath: (name: string, platform: ?string) => ?string,
  mainFields: $ReadOnlyArray<string>,
  moduleCache: ModuleishCache<TPackage>,
  nodeModulesPaths: $ReadOnlyArray<string>,
  preferNativePlatform: boolean,
  projectRoot: string,
  reporter: Reporter,
  resolveAsset: ResolveAsset,
  resolveRequest: ?CustomResolver,
  sourceExts: $ReadOnlyArray<string>,
  unstable_conditionNames: $ReadOnlyArray<string>,
  unstable_conditionsByPlatform: $ReadOnly<{
    [platform: string]: $ReadOnlyArray<string>,
  }>,
  unstable_enablePackageExports: boolean,
  unstable_getRealPath: ?GetRealPath,
}>;

class ModuleResolver<TPackage: Packageish> {
  _options: Options<TPackage>;
  // A module representing the project root, used as the origin when resolving `emptyModulePath`.
  _projectRootFakeModule: Moduleish;
  // An empty module, the result of resolving `emptyModulePath` from the project root.
  _cachedEmptyModule: ?BundlerResolution;

  constructor(options: Options<TPackage>) {
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

  _getEmptyModule(): BundlerResolution {
    let emptyModule = this._cachedEmptyModule;
    if (!emptyModule) {
      emptyModule = this.resolveDependency(
        this._projectRootFakeModule,
        {
          name: this._options.emptyModulePath,
          data: {
            key: this._options.emptyModulePath,
            asyncType: null,
            locs: [],
          },
        },
        false,
        null,
        /* resolverOptions */ {},
      );
      this._cachedEmptyModule = emptyModule;
    }
    return emptyModule;
  }

  resolveDependency(
    fromModule: Moduleish,
    dependency: TransformResultDependency,
    allowHaste: boolean,
    platform: string | null,
    resolverOptions: ResolverInputOptions,
  ): BundlerResolution {
    const {
      assetExts,
      disableHierarchicalLookup,
      doesFileExist,
      extraNodeModules,
      mainFields,
      nodeModulesPaths,
      preferNativePlatform,
      resolveAsset,
      resolveRequest,
      sourceExts,
      unstable_conditionNames,
      unstable_conditionsByPlatform,
      unstable_enablePackageExports,
      unstable_getRealPath,
    } = this._options;

    try {
      const result = Resolver.resolve(
        createDefaultContext(
          {
            allowHaste,
            assetExts,
            disableHierarchicalLookup,
            doesFileExist,
            extraNodeModules,
            mainFields,
            nodeModulesPaths,
            preferNativePlatform,
            resolveAsset,
            resolveRequest,
            sourceExts,
            unstable_conditionNames,
            unstable_conditionsByPlatform,
            unstable_enablePackageExports,
            unstable_getRealPath,
            unstable_logWarning: this._logWarning,
            customResolverOptions: resolverOptions.customResolverOptions ?? {},
            originModulePath: fromModule.path,
            resolveHasteModule: (name: string) =>
              this._options.getHasteModulePath(name, platform),
            resolveHastePackage: (name: string) =>
              this._options.getHastePackagePath(name, platform),
            getPackage: this._getPackage,
            getPackageForModule: (modulePath: string) =>
              this._getPackageForModule(fromModule, modulePath),
          },
          dependency,
        ),
        dependency.name,
        platform,
      );
      return this._getFileResolvedModule(result);
    } catch (error) {
      if (error instanceof Resolver.FailedToResolvePathError) {
        const {candidates} = error;
        throw new UnableToResolveError(
          fromModule.path,
          dependency.name,
          [
            '\n\nNone of these files exist:',
            `  * ${Resolver.formatFileCandidates(
              this._removeRoot(candidates.file),
            )}`,
            `  * ${Resolver.formatFileCandidates(
              this._removeRoot(candidates.dir),
            )}`,
          ].join('\n'),
          {
            cause: error,
            dependency,
          },
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
          dependency.name,
          [
            `${dependency.name} could not be found within the project${
              hint || '.'
            }`,
            ...displayDirPaths.map((dirPath: string) => `  ${dirPath}`),
          ].join('\n'),
          {
            cause: error,
            dependency,
          },
        );
      }
      throw error;
    }
  }

  _getPackage = (packageJsonPath: string): ?PackageJson => {
    try {
      return this._options.moduleCache.getPackage(packageJsonPath).read();
    } catch (e) {
      // Do nothing. The standard module cache does not trigger any error, but
      // the ModuleGraph one does, if the module does not exist.
    }

    return null;
  };

  _getPackageForModule = (
    fromModule: Moduleish,
    modulePath: string,
  ): ?PackageInfo => {
    let pkg;

    try {
      pkg = this._options.moduleCache.getPackageOf(modulePath);
    } catch (e) {
      // Do nothing. The standard module cache does not trigger any error, but
      // the ModuleGraph one does, if the module does not exist.
    }

    return pkg != null
      ? {
          rootPath: path.dirname(pkg.path),
          packageJson: pkg.read(),
        }
      : null;
  };

  /**
   * TODO: Return Resolution instead of coercing to BundlerResolution here
   */
  _getFileResolvedModule(resolution: Resolution): BundlerResolution {
    switch (resolution.type) {
      case 'sourceFile':
        return resolution;
      case 'assetFiles':
        // FIXME: we should forward ALL the paths/metadata,
        // not just an arbitrary item!
        const arbitrary = getArrayLowestItem(resolution.filePaths);
        invariant(arbitrary != null, 'invalid asset resolution');
        return {type: 'sourceFile', filePath: arbitrary};
      case 'empty':
        return this._getEmptyModule();
      default:
        (resolution.type: empty);
        throw new Error('invalid type');
    }
  }

  _logWarning = (message: string): void => {
    this._options.reporter.update({
      type: 'resolver_warning',
      message,
    });
  };

  _removeRoot(candidates: FileCandidates): FileCandidates {
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
  /**
   * Original error that causes this error
   */
  cause: ?Error;

  constructor(
    originModulePath: string,
    targetModuleName: string,
    message: string,
    options?: $ReadOnly<{
      dependency?: ?TransformResultDependency,
      cause?: Error,
    }>,
  ) {
    super();
    this.originModulePath = originModulePath;
    this.targetModuleName = targetModuleName;
    const codeFrameMessage = this.buildCodeFrameMessage(options?.dependency);
    this.message =
      util.format(
        'Unable to resolve module %s from %s: %s',
        targetModuleName,
        originModulePath,
        message,
      ) + (codeFrameMessage ? '\n' + codeFrameMessage : '');

    this.cause = options?.cause;
  }

  buildCodeFrameMessage(dependency: ?TransformResultDependency): ?string {
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

    const location = dependency?.data.locs.length
      ? refineDependencyLocation(
          dependency.data.locs[0],
          file,
          this.targetModuleName,
        )
      : // TODO: Ultimately we shouldn't ever have to guess the location.
        guessDependencyLocation(file, this.targetModuleName);
    return codeFrameColumns(
      fs.readFileSync(this.originModulePath, 'utf8'),
      location,
      {forceColor: process.env.NODE_ENV !== 'test'},
    );
  }
}

// Given a source location for an import declaration or `require()` call (etc),
// return a location for use with @babel/code-frame in the resolution error.
function refineDependencyLocation(
  loc: BabelSourceLocation,
  fileContents: string,
  targetSpecifier: string,
): {
  start: {column: number, line: number},
  end?: {column: number, line: number},
} {
  const lines = fileContents.split('\n');
  // If we can find the module name in range of the given loc, surrounded by
  // matching quotes, that's likely our specifier. Point to the first column of
  // the *last* valid occurrence.
  // Note that module names may not always be found in the source code verbatim,
  // whether because of escaping or because of exotic dependency APIs.
  for (let line = loc.end.line - 1; line >= loc.start.line - 1; line--) {
    const maxColumn =
      line === loc.end.line ? loc.end.column + 2 : lines[line].length;
    const minColumn = line === loc.start.line ? loc.start.column - 1 : 0;
    const lineStr = lines[line];
    const lineSlice = lineStr.slice(minColumn, maxColumn);
    for (
      let offset = lineSlice.lastIndexOf(targetSpecifier);
      offset !== -1 && // leave room for quotes
      offset > 0 &&
      offset < lineSlice.length - 1;
      offset = lineSlice.lastIndexOf(targetSpecifier, offset - 1)
    ) {
      const maybeQuoteBefore = lineSlice[minColumn + offset - 1];
      const maybeQuoteAfter =
        lineStr[minColumn + offset + targetSpecifier.length];
      if (isQuote(maybeQuoteBefore) && maybeQuoteBefore === maybeQuoteAfter) {
        return {
          start: {
            line: line + 1,
            column: minColumn + offset + 1,
          },
        };
      }
    }
  }
  // Otherwise, if this is a single-line loc, return it exactly, as a range.
  if (loc.start.line === loc.end.line) {
    return {
      start: {
        line: loc.start.line,
        column: loc.start.column + 1,
      },
      end: {
        line: loc.end.line,
        column: loc.end.column + 1,
      },
    };
  }
  // Otherwise, point to the first column of the loc, to avoid including too
  // much unnecessary context.
  return {
    start: {
      line: loc.start.line,
      column: loc.start.column + 1,
    },
  };
}

function guessDependencyLocation(
  fileContents: string,
  targetSpecifier: string,
) {
  const lines = fileContents.split('\n');
  let lineNumber = 0;
  let column = -1;
  for (let line = 0; line < lines.length; line++) {
    const columnLocation = lines[line].lastIndexOf(targetSpecifier);
    if (columnLocation >= 0) {
      lineNumber = line;
      column = columnLocation;
      break;
    }
  }
  return {
    start: {column: column + 1, line: lineNumber + 1},
  };
}

function isQuote(str: ?string): boolean {
  return str === '"' || str === "'" || str === '`';
}

module.exports = {
  ModuleResolver,
  UnableToResolveError,
};
