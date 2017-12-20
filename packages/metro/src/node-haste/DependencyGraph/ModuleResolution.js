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

const invariant = require('fbjs/lib/invariant');
const isAbsolutePath = require('absolute-path');
const path = require('path');
const util = require('util');

import type DependencyGraphHelpers from './DependencyGraphHelpers';

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
  +root: string,
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
  +doesFileExist: (filePath: string) => boolean,
  +extraNodeModules: ?Object,
  +helpers: DependencyGraphHelpers,
  +moduleCache: ModuleishCache<TModule, TPackage>,
  +preferNativePlatform: boolean,
  +moduleMap: ModuleMap,
  +resolveAsset: (
    dirPath: string,
    assetName: string,
    platform: string | null,
  ) => ?$ReadOnlyArray<string>,
  +sourceExts: Array<string>,
|};

/**
 * This is a way to describe what files we tried to look for when resolving
 * a module name as file. This is mainly used for error reporting, so that
 * we can explain why we cannot resolve a module.
 */
type FileCandidates =
  // We only tried to resolve a specific asset.
  | {|+type: 'asset', +name: string|}
  // We attempted to resolve a name as being a source file (ex. JavaScript,
  // JSON...), in which case there can be several extensions we tried, for
  // example `foo.ios.js`, `foo.js`, etc. (The array only contain extensions,
  // ie. `['ios.js', 'js']`.)
  | {|+type: 'sourceFile', +candidateExts: $ReadOnlyArray<string>|};

/**
 * This is a way to describe what files we tried to look for when resolving
 * a module name as directory.
 */
type DirCandidates =
  | {|+type: 'package', +dir: DirCandidates, +file: FileCandidates|}
  | {|+type: 'index', +file: FileCandidates|};

type FileAndDirCandidates = {|+dir: DirCandidates, +file: FileCandidates|};

type Result<TResolution, TCandidates> =
  | {|+type: 'resolved', +resolution: TResolution|}
  | {|+type: 'failed', +candidates: TCandidates|};

type AssetFileResolution = $ReadOnlyArray<string>;
type FileResolution =
  | {|+type: 'sourceFile', +filePath: string|}
  | {|+type: 'assetFiles', +filePaths: AssetFileResolution|};

/**
 * It may not be a great pattern to leverage exception just for "trying" things
 * out, notably for performance. We should consider replacing these functions
 * to be nullable-returning, or being better stucture to the algorithm.
 */
function tryResolveSync<T>(action: () => T, secondaryAction: () => T): T {
  try {
    return action();
  } catch (error) {
    if (!(error instanceof UnableToResolveError)) {
      throw error;
    }
    return secondaryAction();
  }
}

class ModuleResolver<TModule: Moduleish, TPackage: Packageish> {
  _options: Options<TModule, TPackage>;

  static EMPTY_MODULE: string = require.resolve('./assets/empty-module.js');

  constructor(options: Options<TModule, TPackage>) {
    this._options = options;
  }

  resolveHasteDependency(
    fromModule: TModule,
    toModuleName: string,
    platform: string | null,
  ): TModule {
    toModuleName = normalizePath(toModuleName);

    const pck = fromModule.getPackage();
    let realModuleName;
    if (pck) {
      /* $FlowFixMe: redirectRequire can actually return `false` for
         exclusions*/
      realModuleName = (pck.redirectRequire(toModuleName): string);
    } else {
      realModuleName = toModuleName;
    }

    const modulePath = this._options.moduleMap.getModule(
      realModuleName,
      platform,
      /* supportsNativePlatform */ true,
    );
    if (modulePath != null) {
      const module = this._options.moduleCache.getModule(modulePath);
      /* temporary until we strengthen the typing */
      invariant(module.type === 'Module', 'expected Module type');
      return module;
    }

    let packageName = realModuleName;
    let packagePath;
    while (packageName && packageName !== '.') {
      packagePath = this._options.moduleMap.getPackage(
        packageName,
        platform,
        /* supportsNativePlatform */ true,
      );
      if (packagePath != null) {
        break;
      }
      packageName = path.dirname(packageName);
    }

    if (packagePath != null) {
      const package_ = this._options.moduleCache.getPackage(packagePath);
      /* temporary until we strengthen the typing */
      invariant(package_.type === 'Package', 'expected Package type');

      const potentialModulePath = path.join(
        package_.root,
        path.relative(packageName, realModuleName),
      );
      return this._loadAsFileOrDirOrThrow(
        potentialModulePath,
        fromModule,
        toModuleName,
        platform,
      );
    }

    throw new UnableToResolveError(
      fromModule.path,
      toModuleName,
      'Unable to resolve dependency',
    );
  }

  _redirectRequire(fromModule: TModule, modulePath: string): string | false {
    const pck = fromModule.getPackage();
    if (pck) {
      return pck.redirectRequire(modulePath);
    }
    return modulePath;
  }

  _resolveFileOrDir(
    fromModule: TModule,
    toModuleName: string,
    platform: string | null,
  ): TModule {
    const potentialModulePath = isAbsolutePath(toModuleName)
      ? resolveWindowsPath(toModuleName)
      : path.join(path.dirname(fromModule.path), toModuleName);

    const realModuleName = this._redirectRequire(
      fromModule,
      potentialModulePath,
    );
    if (realModuleName === false) {
      return this._getEmptyModule(fromModule, toModuleName);
    }
    return this._loadAsFileOrDirOrThrow(
      realModuleName,
      fromModule,
      toModuleName,
      platform,
    );
  }

  resolveNodeDependency(
    fromModule: TModule,
    toModuleName: string,
    platform: string | null,
  ): TModule {
    if (isRelativeImport(toModuleName) || isAbsolutePath(toModuleName)) {
      return this._resolveFileOrDir(fromModule, toModuleName, platform);
    }
    const realModuleName = this._redirectRequire(fromModule, toModuleName);
    // exclude
    if (realModuleName === false) {
      return this._getEmptyModule(fromModule, toModuleName);
    }

    if (isRelativeImport(realModuleName) || isAbsolutePath(realModuleName)) {
      // derive absolute path /.../node_modules/fromModuleDir/realModuleName
      const fromModuleParentIdx =
        fromModule.path.lastIndexOf('node_modules' + path.sep) + 13;
      const fromModuleDir = fromModule.path.slice(
        0,
        fromModule.path.indexOf(path.sep, fromModuleParentIdx),
      );
      const absPath = path.join(fromModuleDir, realModuleName);
      return this._resolveFileOrDir(fromModule, absPath, platform);
    }

    const searchQueue = [];
    for (
      let currDir = path.dirname(fromModule.path);
      currDir !== '.' && currDir !== path.parse(fromModule.path).root;
      currDir = path.dirname(currDir)
    ) {
      const searchPath = path.join(currDir, 'node_modules');
      searchQueue.push(path.join(searchPath, realModuleName));
    }

    const extraSearchQueue = [];
    if (this._options.extraNodeModules) {
      const {extraNodeModules} = this._options;
      const bits = path.normalize(toModuleName).split(path.sep);
      const packageName = bits[0];
      if (extraNodeModules[packageName]) {
        bits[0] = extraNodeModules[packageName];
        extraSearchQueue.push(path.join.apply(path, bits));
      }
    }

    const fullSearchQueue = searchQueue.concat(extraSearchQueue);
    for (let i = 0; i < fullSearchQueue.length; ++i) {
      const result = this._loadAsFileOrDir(fullSearchQueue[i], platform);
      // Eventually we should aggregate the candidates so that we can
      // report them with more accuracy in the error below.
      if (result.type === 'resolved') {
        return this._getFileResolvedModule(result.resolution);
      }
    }

    const displaySearchQueue = searchQueue
      .filter(dirPath => this._options.dirExists(dirPath))
      .concat(extraSearchQueue);

    const hint = displaySearchQueue.length ? ' or in these directories:' : '';
    throw new UnableToResolveError(
      fromModule.path,
      toModuleName,
      `Module does not exist in the module map${hint}\n` +
        displaySearchQueue
          .map(searchPath => `  ${path.dirname(searchPath)}\n`)
          .join(', ') +
        '\n' +
        `This might be related to https://github.com/facebook/react-native/issues/4968\n` +
        `To resolve try the following:\n` +
        `  1. Clear watchman watches: \`watchman watch-del-all\`.\n` +
        `  2. Delete the \`node_modules\` folder: \`rm -rf node_modules && npm install\`.\n` +
        '  3. Reset Metro Bundler cache: `rm -rf $TMPDIR/react-*` or `npm start -- --reset-cache`.' +
        '  4. Remove haste cache: `rm -rf $TMPDIR/haste-map-react-native-packager-*`.',
    );
  }

  /**
   * Eventually we'd like to remove all the exception being throw in the middle
   * of the resolution algorithm, instead keeping track of tentatives in a
   * specific data structure, and building a proper error at the top-level.
   * This function is meant to be a temporary proxy for _loadAsFile until
   * the callsites switch to that tracking structure.
   */
  _loadAsFileOrDirOrThrow(
    potentialModulePath: string,
    fromModule: TModule,
    toModuleName: string,
    platform: string | null,
  ): TModule {
    const result = this._loadAsFileOrDir(potentialModulePath, platform);
    if (result.type === 'resolved') {
      return this._getFileResolvedModule(result.resolution);
    }
    // We ignore the `file` candidates as a temporary measure before this
    // function is gotten rid of, because it's historically been ignored anyway.
    const {dir} = result.candidates;
    if (dir.type === 'package') {
      throw new UnableToResolveError(
        fromModule.path,
        toModuleName,
        `could not resolve \`${potentialModulePath}' as a folder: it ` +
          'contained a package, but its "main" could not be resolved',
      );
    }
    invariant(dir.type === 'index', 'invalid candidate type');
    throw new UnableToResolveError(
      fromModule.path,
      toModuleName,
      `could not resolve \`${potentialModulePath}' as a file nor as a folder`,
    );
  }

  /**
   * FIXME: get rid of this function and of the reliance on `TModule`
   * altogether, return strongly typed resolutions at the top-level instead.
   */
  _getFileResolvedModule(resolution: FileResolution): TModule {
    switch (resolution.type) {
      case 'sourceFile':
        return this._options.moduleCache.getModule(resolution.filePath);
      case 'assetFiles':
        // FIXME: we should forward ALL the paths/metadata,
        // not just an arbitrary item!
        const arbitrary = getArrayLowestItem(resolution.filePaths);
        invariant(arbitrary != null, 'invalid asset resolution');
        return this._options.moduleCache.getAssetModule(arbitrary);
    }
    throw new Error('switch is not exhaustive');
  }

  /**
   * In the NodeJS-style module resolution scheme we want to check potential
   * paths both as directories and as files. For example, `foo/bar` may resolve
   * to `foo/bar.js` (preferred), but it might also be `foo/bar/index.js`, or
   * even a package directory.
   */
  _loadAsFileOrDir(
    potentialModulePath: string,
    platform: string | null,
  ): Result<FileResolution, FileAndDirCandidates> {
    const dirPath = path.dirname(potentialModulePath);
    const fileNameHint = path.basename(potentialModulePath);
    const fileResult = this._loadAsFile(dirPath, fileNameHint, platform);
    if (fileResult.type === 'resolved') {
      return fileResult;
    }
    const dirResult = this._loadAsDir(potentialModulePath, platform);
    if (dirResult.type === 'resolved') {
      return dirResult;
    }
    return failedFor({file: fileResult.candidates, dir: dirResult.candidates});
  }

  isAssetFile(filename: string): boolean {
    return this._options.helpers.isAssetFile(filename);
  }

  _loadAsFile(
    dirPath: string,
    fileNameHint: string,
    platform: string | null,
  ): Result<FileResolution, FileCandidates> {
    if (this.isAssetFile(fileNameHint)) {
      const result = this._loadAsAssetFile(dirPath, fileNameHint, platform);
      return mapResult(result, filePaths => ({type: 'assetFiles', filePaths}));
    }
    const candidateExts = [];
    const filePathPrefix = path.join(dirPath, fileNameHint);
    const context = {filePathPrefix, candidateExts};
    const filePath = this._tryToResolveSourceFile(context, platform);
    if (filePath != null) {
      return resolvedAs({type: 'sourceFile', filePath});
    }
    return failedFor({type: 'sourceFile', candidateExts});
  }

  _loadAsAssetFile(
    dirPath: string,
    fileNameHint: string,
    platform: string | null,
  ): Result<AssetFileResolution, FileCandidates> {
    const {resolveAsset} = this._options;
    const assetNames = resolveAsset(dirPath, fileNameHint, platform);
    if (assetNames != null) {
      return resolvedAs(
        assetNames.map(assetName => {
          return path.join(dirPath, assetName);
        }),
      );
    }
    return failedFor({type: 'asset', name: fileNameHint});
  }

  /**
   * A particular 'base path' can resolve to a number of possibilities depending
   * on the context. For example `foo/bar` could resolve to `foo/bar.ios.js`, or
   * to `foo/bar.js`. If can also resolve to the bare path `foo/bar` itself, as
   * supported by Node.js resolution. On the other hand it doesn't support
   * `foo/bar.ios`, for historical reasons.
   *
   * Return the full path of the resolved module, `null` if no resolution could
   * be found.
   */
  _tryToResolveSourceFile(
    context: {|
      +candidateExts: Array<string>,
      +filePathPrefix: string,
    |},
    platform: ?string,
  ): ?string {
    let filePath = this._tryToResolveFileForExt(context, '');
    if (filePath) {
      return filePath;
    }
    const {sourceExts} = this._options;
    for (let i = 0; i < sourceExts.length; i++) {
      const ext = `.${sourceExts[i]}`;
      filePath = this._tryToResolveFileForExts(context, ext, platform);
      if (filePath != null) {
        return filePath;
      }
    }
    return null;
  }

  /**
   * For a particular extension, ex. `js`, we want to try a few possibilities,
   * such as `foo.ios.js`, `foo.native.js`, and of course `foo.js`.
   *
   * Return the full path of the resolved module, `null` if no resolution could
   * be found.
   */
  _tryToResolveFileForExts(
    context: {|
      +candidateExts: Array<string>,
      +filePathPrefix: string,
    |},
    sourceExt: string,
    platform: ?string,
  ): ?string {
    const {preferNativePlatform} = this._options;
    if (platform != null) {
      const platExt = `.${platform}${sourceExt}`;
      const filePath = this._tryToResolveFileForExt(context, platExt);
      if (filePath) {
        return filePath;
      }
    }
    if (preferNativePlatform) {
      const nativeExt = `.native${sourceExt}`;
      const filePath = this._tryToResolveFileForExt(context, nativeExt);
      if (filePath) {
        return filePath;
      }
    }
    const filePath = this._tryToResolveFileForExt(context, sourceExt);
    return filePath;
  }

  /**
   * We try to resolve a single possible extension. If it doesn't exist, then
   * we make sure to add the extension to a list of candidates for reporting.
   */
  _tryToResolveFileForExt(
    context: {|
      +candidateExts: Array<string>,
      +filePathPrefix: string,
    |},
    extension: string,
  ): ?string {
    const filePath = `${context.filePathPrefix}${extension}`;
    if (this._options.doesFileExist(filePath)) {
      return filePath;
    }
    context.candidateExts.push(filePath);
    return null;
  }

  _getEmptyModule(fromModule: TModule, toModuleName: string): TModule {
    const {moduleCache} = this._options;
    const module = moduleCache.getModule(ModuleResolver.EMPTY_MODULE);
    if (module != null) {
      return module;
    }
    throw new UnableToResolveError(
      fromModule.path,
      toModuleName,
      "could not resolve `${ModuleResolver.EMPTY_MODULE}'",
    );
  }

  /**
   * Try to resolve a potential path as if it was a directory-based module.
   * Either this is a directory that contains a package, or that the directory
   * contains an index file. If it fails to resolve these options, it returns
   * `null` and fills the array of `candidates` that were tried.
   *
   * For example we could try to resolve `/foo/bar`, that would eventually
   * resolve to `/foo/bar/lib/index.ios.js` if we're on platform iOS and that
   * `bar` contains a package which entry point is `./lib/index` (or `./lib`).
   */
  _loadAsDir(
    potentialDirPath: string,
    platform: string | null,
  ): Result<FileResolution, DirCandidates> {
    const packageJsonPath = path.join(potentialDirPath, 'package.json');
    if (this._options.doesFileExist(packageJsonPath)) {
      return this._loadAsPackage(packageJsonPath, platform);
    }
    const result = this._loadAsFile(potentialDirPath, 'index', platform);
    if (result.type === 'resolved') {
      return result;
    }
    return failedFor({type: 'index', file: result.candidates});
  }

  /**
   * Right now we just consider it a failure to resolve if we couldn't find the
   * file corresponding to the `main` indicated by a package. Argument can be
   * made this should be changed so that failing to find the `main` is not a
   * resolution failure, but identified instead as a corrupted or invalid
   * package (or that a package only supports a specific platform, etc.)
   */
  _loadAsPackage(
    packageJsonPath: string,
    platform: string | null,
  ): Result<FileResolution, DirCandidates> {
    const package_ = this._options.moduleCache.getPackage(packageJsonPath);
    const mainPrefixPath = package_.getMain();
    const dirPath = path.dirname(mainPrefixPath);
    const prefixName = path.basename(mainPrefixPath);
    const fileResult = this._loadAsFile(dirPath, prefixName, platform);
    if (fileResult.type === 'resolved') {
      return fileResult;
    }
    const dirResult = this._loadAsDir(mainPrefixPath, platform);
    if (dirResult.type === 'resolved') {
      return dirResult;
    }
    return failedFor({
      type: 'package',
      dir: dirResult.candidates,
      file: fileResult.candidates,
    });
  }
}

// HasteFS stores paths with backslashes on Windows, this ensures the path is in
// the proper format. Will also add drive letter if not present so `/root` will
// resolve to `C:\root`. Noop on other platforms.
function resolveWindowsPath(modulePath) {
  if (path.sep !== '\\') {
    return modulePath;
  }
  return path.resolve(modulePath);
}

function isRelativeImport(filePath: string) {
  return /^[.][.]?(?:[/]|$)/.test(filePath);
}

function normalizePath(modulePath) {
  if (path.sep === '/') {
    modulePath = path.normalize(modulePath);
  } else if (path.posix) {
    modulePath = path.posix.normalize(modulePath);
  }

  return modulePath.replace(/\/$/, '');
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

function resolvedAs<TResolution, TCandidates>(
  resolution: TResolution,
): Result<TResolution, TCandidates> {
  return {type: 'resolved', resolution};
}

function failedFor<TResolution, TCandidates>(
  candidates: TCandidates,
): Result<TResolution, TCandidates> {
  return {type: 'failed', candidates};
}

function mapResult<TResolution, TNewResolution, TCandidates>(
  result: Result<TResolution, TCandidates>,
  mapper: TResolution => TNewResolution,
): Result<TNewResolution, TCandidates> {
  if (result.type === 'failed') {
    return result;
  }
  return {type: 'resolved', resolution: mapper(result.resolution)};
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
  UnableToResolveError,
  ModuleResolver,
  isRelativeImport,
  tryResolveSync,
};
