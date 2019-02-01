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

const FailedToResolveNameError = require('./FailedToResolveNameError');
const FailedToResolvePathError = require('./FailedToResolvePathError');
const InvalidPackageError = require('./InvalidPackageError');

const isAbsolutePath = require('absolute-path');
const path = require('path');

import type {
  AssetFileResolution,
  DoesFileExist,
  FileAndDirCandidates,
  FileCandidates,
  FileContext,
  FileOrDirContext,
  FileResolution,
  ModulePathContext,
  ResolutionContext,
  Resolution,
  ResolveAsset,
  Result,
} from './types';

type ModuleParts = {
  +package: string,
  +scope: string,
  +file: string,
};

function resolve(
  context: ResolutionContext,
  moduleName: string,
  platform: string | null,
): Resolution {
  const resolveRequest = context.resolveRequest;
  if (
    !resolveRequest &&
    (isRelativeImport(moduleName) || isAbsolutePath(moduleName))
  ) {
    return resolveModulePath(context, moduleName, platform);
  }

  const realModuleName = context.redirectModulePath(moduleName);

  // exclude
  if (realModuleName === false) {
    return {type: 'empty'};
  }

  const {originModulePath} = context;
  const normalizedName = normalizePath(realModuleName);
  const isDirectImport =
    isRelativeImport(normalizedName) || isAbsolutePath(normalizedName);

  // We disable the direct file loading to let the custom resolvers deal with it
  if (!resolveRequest && isDirectImport) {
    // derive absolute path /.../node_modules/originModuleDir/normalizedName
    const fromModuleParentIdx =
      originModulePath.lastIndexOf('node_modules' + path.sep) + 13;
    const originModuleDir = originModulePath.slice(
      0,
      originModulePath.indexOf(path.sep, fromModuleParentIdx),
    );
    const absPath = path.join(originModuleDir, normalizedName);
    return resolveModulePath(context, absPath, platform);
  }

  // The Haste resolution must occur before the custom resolver because we want
  // to allow overriding imports. It could be part of the custom resolver, but
  // that's not the case right now.
  if (context.allowHaste && !isDirectImport) {
    const modulePath = context.resolveHasteModule(normalizedName);
    if (modulePath != null) {
      return {type: 'sourceFile', filePath: modulePath};
    }
  }

  if (resolveRequest) {
    try {
      const resolution = resolveRequest(context, normalizedName, platform);
      if (resolution) {
        return resolution;
      }
    } catch (error) {}
    if (isDirectImport) {
      throw new Error('Failed to resolve module: ' + normalizedName);
    }
  }

  const parsedName = parseModuleName(normalizedName);
  const modulePaths = [];
  for (let packagePath of genPackagePaths(context, parsedName)) {
    packagePath = context.redirectPackage(packagePath);
    const modulePath = context.redirectModulePath(
      path.join(packagePath, parsedName.file),
    );
    const result = resolveFileOrDir(context, modulePath, platform);
    if (result.type === 'resolved') {
      return result.resolution;
    }
    modulePaths.push(modulePath);
  }
  throw new FailedToResolveNameError(modulePaths);
}

function parseModuleName(moduleName: string): ModuleParts {
  const parts = moduleName.split(path.sep);
  const scope = parts[0].startsWith('@') ? parts[0] : '';
  return {
    scope,
    package: parts.slice(0, scope ? 2 : 1).join(path.sep),
    file: parts.slice(scope ? 2 : 1).join(path.sep),
  };
}

function* genPackagePaths(
  context: ResolutionContext,
  parsedName: ModuleParts,
): Iterable<string> {
  /**
   * Find the nearest "node_modules" directory that contains
   * the imported package.
   */
  const {root} = path.parse(context.originModulePath);
  let parent = context.originModulePath;
  do {
    parent = path.dirname(parent);
    if (path.basename(parent) !== 'node_modules') {
      yield path.join(parent, 'node_modules', parsedName.package);
    }
  } while (parent !== root);

  /**
   * Check the user-provided `extraNodeModules` module map for a
   * direct mapping to a directory that contains the imported package.
   */
  if (context.extraNodeModules) {
    const extras = context.extraNodeModules;
    if ((parent = extras[parsedName.package])) {
      yield path.join(parent, parsedName.package);
    }
    if (parsedName.scope && (parent = extras[parsedName.scope])) {
      yield path.join(parent, parsedName.package);
    }
  }
}

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
): Resolution {
  const modulePath = isAbsolutePath(toModuleName)
    ? resolveWindowsPath(toModuleName)
    : path.join(path.dirname(context.originModulePath), toModuleName);
  const redirectedPath = context.redirectModulePath(modulePath);
  if (redirectedPath === false) {
    return {type: 'empty'};
  }
  const result = resolveFileOrDir(context, redirectedPath, platform);
  if (result.type === 'resolved') {
    return result.resolution;
  }
  throw new FailedToResolvePathError(result.candidates);
}

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
  try {
    const assetNames = resolveAsset(dirPath, fileNameHint, platform);

    if (assetNames != null) {
      const res = assetNames.map(assetName => path.join(dirPath, assetName));
      return resolvedAs(res);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      return failedFor({type: 'asset', name: fileNameHint});
    }
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
