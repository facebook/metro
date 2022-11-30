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
  DoesFileExist,
  FileAndDirCandidates,
  FileCandidates,
  FileContext,
  FileOrDirContext,
  HasteContext,
  ModulePathContext,
  Resolution,
  ResolutionContext,
  Result,
} from './types';

const FailedToResolveNameError = require('./FailedToResolveNameError');
const FailedToResolvePathError = require('./FailedToResolvePathError');
const formatFileCandidates = require('./formatFileCandidates');
const InvalidPackageError = require('./InvalidPackageError');
const isAbsolutePath = require('absolute-path');
const path = require('path');

function resolve(
  context: ResolutionContext,
  moduleName: string,
  platform: string | null,
): Resolution {
  const resolveRequest = context.resolveRequest;
  if (
    resolveRequest &&
    // Prevent infinite recursion in the trivial case
    resolveRequest !== resolve
  ) {
    return resolveRequest(
      Object.freeze({...context, resolveRequest: resolve}),
      moduleName,
      platform,
    );
  }

  if (isRelativeImport(moduleName) || isAbsolutePath(moduleName)) {
    return resolveModulePath(context, moduleName, platform);
  }

  const realModuleName = context.redirectModulePath(moduleName);

  // exclude
  if (realModuleName === false) {
    return {type: 'empty'};
  }

  const {originModulePath} = context;

  const isDirectImport =
    isRelativeImport(realModuleName) || isAbsolutePath(realModuleName);

  if (isDirectImport) {
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

  if (context.allowHaste && !isDirectImport) {
    const normalizedName = normalizePath(realModuleName);
    const result = resolveHasteName(context, normalizedName, platform);
    if (result.type === 'resolved') {
      return result.resolution;
    }
  }

  const {disableHierarchicalLookup} = context;

  const nodeModulesPaths = [];
  let next = path.dirname(originModulePath);

  if (!disableHierarchicalLookup) {
    let candidate;
    do {
      candidate = next;
      nodeModulesPaths.push(path.join(candidate, 'node_modules'));
      next = path.dirname(candidate);
    } while (candidate !== next);
  }

  // Fall back to `nodeModulesPaths` after hierarchical lookup, similar to $NODE_PATH
  nodeModulesPaths.push(...context.nodeModulesPaths);

  const extraPaths = [];
  const {extraNodeModules} = context;
  if (extraNodeModules) {
    let bits = path.normalize(moduleName).split(path.sep);
    let packageName;
    // Normalize packageName and bits for scoped modules
    if (bits.length >= 2 && bits[0].startsWith('@')) {
      packageName = bits.slice(0, 2).join('/');
      bits = bits.slice(1);
    } else {
      packageName = bits[0];
    }
    if (extraNodeModules[packageName]) {
      bits[0] = extraNodeModules[packageName];
      extraPaths.push(path.join.apply(path, bits));
    }
  }

  const allDirPaths = nodeModulesPaths
    .map(nodeModulePath => path.join(nodeModulePath, realModuleName))
    .concat(extraPaths);
  for (let i = 0; i < allDirPaths.length; ++i) {
    const candidate = context.redirectModulePath(allDirPaths[i]);
    // $FlowFixMe[incompatible-call]
    const result = resolveFileOrDir(context, candidate, platform);
    if (result.type === 'resolved') {
      return result.resolution;
    }
  }

  throw new FailedToResolveNameError(nodeModulesPaths, extraPaths);
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
 * Resolve a module as a Haste module or package. For example we might try to
 * resolve `Foo`, that is provided by file `/smth/Foo.js`. Or, in the case of
 * a Haste package, it could be `/smth/Foo/index.js`.
 */
function resolveHasteName(
  context: HasteContext,
  moduleName: string,
  platform: string | null,
): Result<Resolution, void> {
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

  constructor(opts: {
    +candidates: FileAndDirCandidates,
    +moduleName: string,
    +packageName: string,
    +pathInModule: string,
  }) {
    super(
      `While resolving module \`${opts.moduleName}\`, ` +
        `the Haste package \`${opts.packageName}\` was found. However the ` +
        `module \`${opts.pathInModule}\` could not be found within ` +
        'the package. Indeed, none of these files exist:\n\n' +
        `  * \`${formatFileCandidates(opts.candidates.file)}\`\n` +
        `  * \`${formatFileCandidates(opts.candidates.dir)}\``,
    );
    Object.assign(this, opts);
  }
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
): Result<Resolution, FileAndDirCandidates> {
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
): Result<Resolution, FileCandidates> {
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
): Resolution {
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
  fileName: string,
  platform: string | null,
): Result<Resolution, FileCandidates> {
  const {isAssetFile, resolveAsset} = context;
  if (isAssetFile(fileName)) {
    const extension = path.extname(fileName);
    const basename = path.basename(fileName, extension);
    if (!/@\d+(?:\.\d+)?x$/.test(basename)) {
      try {
        const assets = resolveAsset(dirPath, basename, extension);
        if (assets != null) {
          return mapResult(resolvedAs(assets), filePaths => ({
            type: 'assetFiles',
            filePaths,
          }));
        }
      } catch (err) {
        if (err.code === 'ENOENT') {
          return failedFor({type: 'asset', name: fileName});
        }
      }
    }
    return failedFor({type: 'asset', name: fileName});
  }
  const candidateExts: Array<string> = [];
  const filePathPrefix = path.join(dirPath, fileName);
  const sfContext = {...context, candidateExts, filePathPrefix};
  const sourceFileResolution = resolveSourceFile(sfContext, platform);
  if (sourceFileResolution != null) {
    if (typeof sourceFileResolution === 'string') {
      return resolvedAs({type: 'sourceFile', filePath: sourceFileResolution});
    }
    return resolvedAs(sourceFileResolution);
  }
  return failedFor({type: 'sourceFile', filePathPrefix, candidateExts});
}

type SourceFileContext = SourceFileForAllExtsContext & {
  +sourceExts: $ReadOnlyArray<string>,
  ...
};

// Either a full path, or a restricted subset of Resolution.
type SourceFileResolution = ?string | $ReadOnly<{type: 'empty'}>;

/**
 * A particular 'base path' can resolve to a number of possibilities depending
 * on the context. For example `foo/bar` could resolve to `foo/bar.ios.js`, or
 * to `foo/bar.js`. If can also resolve to the bare path `foo/bar` itself, as
 * supported by Node.js resolution. On the other hand it doesn't support
 * `foo/bar.ios`, for historical reasons.
 *
 * Return the full path of the resolved module, `null` if no resolution could
 * be found, or `{type: 'empty'}` if redirected to an empty module.
 */
function resolveSourceFile(
  context: SourceFileContext,
  platform: ?string,
): SourceFileResolution {
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
  ...
};

/**
 * For a particular extension, ex. `js`, we want to try a few possibilities,
 * such as `foo.ios.js`, `foo.native.js`, and of course `foo.js`. Return the
 * full path of the resolved module, `null` if no resolution could be found, or
 * `{type: 'empty'}` if redirected to an empty module.
 */
function resolveSourceFileForAllExts(
  context: SourceFileForAllExtsContext,
  sourceExt: string,
  platform: ?string,
): SourceFileResolution {
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
  +redirectModulePath: (modulePath: string) => string | false,
  ...
};

/**
 * We try to resolve a single possible extension. If it doesn't exist, then
 * we make sure to add the extension to a list of candidates for reporting.
 */
function resolveSourceFileForExt(
  context: SourceFileForExtContext,
  extension: string,
): SourceFileResolution {
  const filePath = `${context.filePathPrefix}${extension}`;
  const redirectedPath =
    // Any redirections for the bare path have already happened
    extension !== '' ? context.redirectModulePath(filePath) : filePath;
  if (redirectedPath === false) {
    return {type: 'empty'};
  }
  if (context.doesFileExist(redirectedPath)) {
    return redirectedPath;
  }
  context.candidateExts.push(extension);
  return null;
}

// HasteFS stores paths with backslashes on Windows, this ensures the path is in
// the proper format. Will also add drive letter if not present so `/root` will
// resolve to `C:\root`. Noop on other platforms.
function resolveWindowsPath(modulePath: string) {
  if (path.sep !== '\\') {
    return modulePath;
  }
  return path.resolve(modulePath);
}

function isRelativeImport(filePath: string) {
  return /^[.][.]?(?:[/]|$)/.test(filePath);
}

function normalizePath(modulePath: any | string) {
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
