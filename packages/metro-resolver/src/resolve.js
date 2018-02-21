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

const InvalidPackageError = require('./InvalidPackageError');

const formatFileCandidates = require('./formatFileCandidates');
const isAbsolutePath = require('absolute-path');
const path = require('path');

import type {
  AssetFileResolution,
  Candidates,
  FileAndDirCandidates,
  FileCandidates,
  FileResolution,
  Resolution,
  Result,
} from './types';

export type ResolutionContext = ModulePathContext &
  HasteContext & {
    originModulePath: string,
    allowHaste: boolean,
    extraNodeModules: ?{[string]: string},
  };

function resolve(
  context: ResolutionContext,
  moduleName: string,
  platform: string | null,
): Result<Resolution, Candidates> {
  if (isRelativeImport(moduleName) || isAbsolutePath(moduleName)) {
    return resolveModulePath(context, moduleName, platform);
  }
  const realModuleName = context.redirectModulePath(moduleName);
  // exclude
  if (realModuleName === false) {
    return resolvedAs({type: 'empty'});
  }

  const {originModulePath} = context;
  if (isRelativeImport(realModuleName) || isAbsolutePath(realModuleName)) {
    // derive absolute path /.../node_modules/originModuleDir/realModuleName
    const fromModuleParentIdx =
      originModulePath.lastIndexOf('node_modules' + path.sep) + 13;
    const originModuleDir = originModulePath.slice(
      0,
      originModulePath.indexOf(path.sep, fromModuleParentIdx),
    );
    const absPath = path.join(originModuleDir, realModuleName);
    return resolveModulePath(context, absPath, platform);
  }

  // At that point we only have module names that
  // aren't relative paths nor absolute paths.
  if (context.allowHaste) {
    const normalizedName = normalizePath(realModuleName);
    const result = resolveHasteName(context, normalizedName, platform);
    if (result.type === 'resolved') {
      return result;
    }
  }

  const dirPaths = [];
  for (
    let currDir = path.dirname(originModulePath);
    currDir !== '.' && currDir !== path.parse(originModulePath).root;
    currDir = path.dirname(currDir)
  ) {
    const searchPath = path.join(currDir, 'node_modules');
    dirPaths.push(path.join(searchPath, realModuleName));
  }

  const extraPaths = [];
  const {extraNodeModules} = context;
  if (extraNodeModules) {
    const bits = path.normalize(moduleName).split(path.sep);
    const packageName = bits[0];
    if (extraNodeModules[packageName]) {
      bits[0] = extraNodeModules[packageName];
      extraPaths.push(path.join.apply(path, bits));
    }
  }

  const allDirPaths = dirPaths.concat(extraPaths);
  for (let i = 0; i < allDirPaths.length; ++i) {
    const result = resolveFileOrDir(context, allDirPaths[i], platform);
    if (result.type === 'resolved') {
      return result;
    }
  }
  return failedFor({type: 'moduleName', dirPaths, extraPaths});
}

type ModulePathContext = FileOrDirContext & {
  /**
   * Full path of the module that is requiring or importing the module to be
   * resolved.
   */
  +originModulePath: string,
  /**
   * Lookup the module's closest `package.json` and process the redirects
   * metadata. Return an absolute path to the resolved path.
   */
  +redirectModulePath: (modulePath: string) => string | false,
};

/**
 * Resolve any kind of module path, whether it's a file or a directory.
 * For example we may want to resolve './foobar'. The closest
 * `package.json` may define a redirection for this path, for example
 * `/smth/lib/foobar`, that may be further resolved to
 * `/smth/lib/foobar/index.ios.js`.
 */
function resolveModulePath(
  context: ModulePathContext,
  toModuleName: string,
  platform: string | null,
): Result<Resolution, Candidates> {
  const modulePath = isAbsolutePath(toModuleName)
    ? resolveWindowsPath(toModuleName)
    : path.join(path.dirname(context.originModulePath), toModuleName);
  const redirectedPath = context.redirectModulePath(modulePath);
  if (redirectedPath === false) {
    return resolvedAs({type: 'empty'});
  }
  const result = resolveFileOrDir(context, redirectedPath, platform);
  if (result.type === 'resolved') {
    return result;
  }
  return failedFor({type: 'modulePath', which: result.candidates});
}

type HasteContext = FileOrDirContext & {
  /**
   * Given a name, this should return the full path to the file that provides
   * a Haste module of that name. Ex. for `Foo` it may return `/smth/Foo.js`.
   */
  +resolveHasteModule: (name: string) => ?string,
  /**
   * Given a name, this should return the full path to the package manifest that
   * provides a Haste package of that name. Ex. for `Foo` it may return
   * `/smth/Foo/package.json`.
   */
  +resolveHastePackage: (name: string) => ?string,
};

/**
 * Resolve a module as a Haste module or package. For example we might try to
 * resolve `Foo`, that is provided by file `/smth/Foo.js`. Or, in the case of
 * a Haste package, it could be `/smth/Foo/index.js`.
 */
function resolveHasteName(
  context: HasteContext,
  moduleName: string,
  platform: string | null,
): Result<FileResolution, void> {
  const modulePath = context.resolveHasteModule(moduleName);
  if (modulePath != null) {
    return resolvedAs({type: 'sourceFile', filePath: modulePath});
  }
  let packageName = moduleName;
  let packageJsonPath = context.resolveHastePackage(packageName);
  while (packageJsonPath == null && packageName && packageName !== '.') {
    packageName = path.dirname(packageName);
    packageJsonPath = context.resolveHastePackage(packageName);
  }
  if (packageJsonPath == null) {
    return failedFor();
  }
  const packageDirPath = path.dirname(packageJsonPath);
  const pathInModule = moduleName.substring(packageName.length + 1);
  const potentialModulePath = path.join(packageDirPath, pathInModule);
  const result = resolveFileOrDir(context, potentialModulePath, platform);
  if (result.type === 'resolved') {
    return result;
  }
  const {candidates} = result;
  const opts = {moduleName, packageName, pathInModule, candidates};
  throw new MissingFileInHastePackageError(opts);
}

class MissingFileInHastePackageError extends Error {
  candidates: FileAndDirCandidates;
  moduleName: string;
  packageName: string;
  pathInModule: string;

  constructor(opts: {|
    +candidates: FileAndDirCandidates,
    +moduleName: string,
    +packageName: string,
    +pathInModule: string,
  |}) {
    super(
      `While resolving module \`${opts.moduleName}\`, ` +
        `the Haste package \`${opts.packageName}\` was found. However the ` +
        `module \`${opts.pathInModule}\` could not be found within ` +
        `the package. Indeed, none of these files exist:\n\n` +
        `  * \`${formatFileCandidates(opts.candidates.file)}\`\n` +
        `  * \`${formatFileCandidates(opts.candidates.dir)}\``,
    );
    Object.assign(this, opts);
  }
}

type FileOrDirContext = FileContext & {
  /**
   * This should return the path of the "main" module of the specified
   * `package.json` file, after post-processing: for example, applying the
   * 'browser' field if necessary.
   *
   * FIXME: move the post-processing here. Right now it is
   * located in `node-haste/Package.js`, and fully duplicated in
   * `ModuleGraph/node-haste/Package.js` (!)
   */
  +getPackageMainPath: (packageJsonPath: string) => string,
};

/**
 * In the NodeJS-style module resolution scheme we want to check potential
 * paths both as directories and as files. For example, `/foo/bar` may resolve
 * to `/foo/bar.js` (preferred), but it might also be `/foo/bar/index.js`, or
 * even a package directory.
 */
function resolveFileOrDir(
  context: FileOrDirContext,
  potentialModulePath: string,
  platform: string | null,
): Result<FileResolution, FileAndDirCandidates> {
  const dirPath = path.dirname(potentialModulePath);
  const fileNameHint = path.basename(potentialModulePath);
  const fileResult = resolveFile(context, dirPath, fileNameHint, platform);
  if (fileResult.type === 'resolved') {
    return fileResult;
  }
  const dirResult = resolveDir(context, potentialModulePath, platform);
  if (dirResult.type === 'resolved') {
    return dirResult;
  }
  return failedFor({file: fileResult.candidates, dir: dirResult.candidates});
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
function resolveDir(
  context: FileOrDirContext,
  potentialDirPath: string,
  platform: string | null,
): Result<FileResolution, FileCandidates> {
  const packageJsonPath = path.join(potentialDirPath, 'package.json');
  if (context.doesFileExist(packageJsonPath)) {
    const resolution = resolvePackage(context, packageJsonPath, platform);
    return {resolution, type: 'resolved'};
  }
  return resolveFile(context, potentialDirPath, 'index', platform);
}

/**
 * Resolve the main module of a package that we know exist. The resolution
 * itself cannot fail because we already resolved the path to the package.
 * If the `main` of the package is invalid, this is not a resolution failure,
 * this means the package is invalid, and should purposefully stop the
 * resolution process altogether.
 */
function resolvePackage(
  context: FileOrDirContext,
  packageJsonPath: string,
  platform: string | null,
): FileResolution {
  const mainPrefixPath = context.getPackageMainPath(packageJsonPath);
  const dirPath = path.dirname(mainPrefixPath);
  const prefixName = path.basename(mainPrefixPath);
  const fileResult = resolveFile(context, dirPath, prefixName, platform);
  if (fileResult.type === 'resolved') {
    return fileResult.resolution;
  }
  const indexResult = resolveFile(context, mainPrefixPath, 'index', platform);
  if (indexResult.type === 'resolved') {
    return indexResult.resolution;
  }
  throw new InvalidPackageError({
    packageJsonPath,
    mainPrefixPath,
    indexCandidates: indexResult.candidates,
    fileCandidates: fileResult.candidates,
  });
}

/**
 * Given a directory path and the base asset name, return a list of all the
 * asset file names that match the given base name in that directory. Return
 * null if there's no such named asset. `platform` is used to identify
 * platform-specific assets, ex. `foo.ios.js` instead of a generic `foo.js`.
 */
export type ResolveAsset = (
  dirPath: string,
  assetName: string,
  platform: string | null,
) => ?$ReadOnlyArray<string>;

/**
 * Check existence of a single file.
 */
export type DoesFileExist = (filePath: string) => boolean;

export type IsAssetFile = (fileName: string) => boolean;

type FileContext = {
  +doesFileExist: DoesFileExist,
  +isAssetFile: IsAssetFile,
  +preferNativePlatform: boolean,
  +resolveAsset: ResolveAsset,
  +sourceExts: $ReadOnlyArray<string>,
};

/**
 * Given a file name for a particular directory, return a resolution result
 * depending on whether or not we found the corresponding module as a file. For
 * example, we might ask for `foo.png`, that resolves to
 * `['/js/beep/foo.ios.png']`. Or we may ask for `boop`, that resolves to
 * `/js/boop.android.ts`. On the other hand this function does not resolve
 * directory-based module names: for example `boop` will not resolve to
 * `/js/boop/index.js` (see `_loadAsDir` for that).
 */
function resolveFile(
  context: FileContext,
  dirPath: string,
  fileNameHint: string,
  platform: string | null,
): Result<FileResolution, FileCandidates> {
  const {isAssetFile, resolveAsset} = context;
  if (isAssetFile(fileNameHint)) {
    const result = resolveAssetFiles(
      resolveAsset,
      dirPath,
      fileNameHint,
      platform,
    );
    return mapResult(result, filePaths => ({type: 'assetFiles', filePaths}));
  }
  const candidateExts = [];
  const filePathPrefix = path.join(dirPath, fileNameHint);
  const sfContext = {...context, candidateExts, filePathPrefix};
  const filePath = resolveSourceFile(sfContext, platform);
  if (filePath != null) {
    return resolvedAs({type: 'sourceFile', filePath});
  }
  return failedFor({type: 'sourceFile', filePathPrefix, candidateExts});
}

type SourceFileContext = SourceFileForAllExtsContext & {
  +sourceExts: $ReadOnlyArray<string>,
};

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
function resolveSourceFile(
  context: SourceFileContext,
  platform: ?string,
): ?string {
  let filePath = resolveSourceFileForAllExts(context, '');
  if (filePath) {
    return filePath;
  }
  const {sourceExts} = context;
  for (let i = 0; i < sourceExts.length; i++) {
    const ext = `.${sourceExts[i]}`;
    filePath = resolveSourceFileForAllExts(context, ext, platform);
    if (filePath != null) {
      return filePath;
    }
  }
  return null;
}

type SourceFileForAllExtsContext = SourceFileForExtContext & {
  +preferNativePlatform: boolean,
};

/**
 * For a particular extension, ex. `js`, we want to try a few possibilities,
 * such as `foo.ios.js`, `foo.native.js`, and of course `foo.js`. Return the
 * full path of the resolved module, `null` if no resolution could be found.
 */
function resolveSourceFileForAllExts(
  context: SourceFileForAllExtsContext,
  sourceExt: string,
  platform: ?string,
): ?string {
  if (platform != null) {
    const ext = `.${platform}${sourceExt}`;
    const filePath = resolveSourceFileForExt(context, ext);
    if (filePath) {
      return filePath;
    }
  }
  if (context.preferNativePlatform) {
    const filePath = resolveSourceFileForExt(context, `.native${sourceExt}`);
    if (filePath) {
      return filePath;
    }
  }
  const filePath = resolveSourceFileForExt(context, sourceExt);
  return filePath;
}

type SourceFileForExtContext = {
  +candidateExts: Array<string>,
  +doesFileExist: DoesFileExist,
  +filePathPrefix: string,
};

/**
 * We try to resolve a single possible extension. If it doesn't exist, then
 * we make sure to add the extension to a list of candidates for reporting.
 */
function resolveSourceFileForExt(
  context: SourceFileForExtContext,
  extension: string,
): ?string {
  const filePath = `${context.filePathPrefix}${extension}`;
  if (context.doesFileExist(filePath)) {
    return filePath;
  }
  context.candidateExts.push(extension);
  return null;
}

/**
 * Find all the asset files corresponding to the file base name, and return
 * it wrapped as a resolution result.
 */
function resolveAssetFiles(
  resolveAsset: ResolveAsset,
  dirPath: string,
  fileNameHint: string,
  platform: string | null,
): Result<AssetFileResolution, FileCandidates> {
  const assetNames = resolveAsset(dirPath, fileNameHint, platform);
  if (assetNames != null) {
    const res = assetNames.map(assetName => path.join(dirPath, assetName));
    return resolvedAs(res);
  }
  return failedFor({type: 'asset', name: fileNameHint});
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

module.exports = resolve;
