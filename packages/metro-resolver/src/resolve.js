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
  FileAndDirCandidates,
  FileCandidates,
  Resolution,
  ResolutionContext,
  Result,
} from './types';

import path from 'path';
import FailedToResolveNameError from './errors/FailedToResolveNameError';
import FailedToResolvePathError from './errors/FailedToResolvePathError';
import InvalidPackageConfigurationError from './errors/InvalidPackageConfigurationError';
import InvalidPackageError from './errors/InvalidPackageError';
import PackagePathNotExportedError from './errors/PackagePathNotExportedError';
import formatFileCandidates from './errors/formatFileCandidates';
import {getPackageEntryPoint} from './PackageResolve';
import {resolvePackageTargetFromExports} from './PackageExportsResolve';
import resolveAsset from './resolveAsset';
import isAssetFile from './utils/isAssetFile';

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

  if (isRelativeImport(moduleName) || path.isAbsolute(moduleName)) {
    const result = resolveModulePath(context, moduleName, platform);
    if (result.type === 'failed') {
      throw new FailedToResolvePathError(result.candidates);
    }
    return result.resolution;
  }

  const realModuleName = context.redirectModulePath(moduleName);

  // exclude
  if (realModuleName === false) {
    return {type: 'empty'};
  }

  const {originModulePath} = context;

  const isDirectImport =
    isRelativeImport(realModuleName) || path.isAbsolute(realModuleName);

  if (isDirectImport) {
    // derive absolute path /.../node_modules/originModuleDir/realModuleName
    const fromModuleParentIdx =
      originModulePath.lastIndexOf('node_modules' + path.sep) + 13;
    const originModuleDir = originModulePath.slice(
      0,
      originModulePath.indexOf(path.sep, fromModuleParentIdx),
    );
    const absPath = path.join(originModuleDir, realModuleName);
    const result = resolveModulePath(context, absPath, platform);
    if (result.type === 'failed') {
      throw new FailedToResolvePathError(result.candidates);
    }
    return result.resolution;
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

    if (candidate === false) {
      return {type: 'empty'};
    }

    const result = resolvePackage(context, candidate, platform);
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
  context: ResolutionContext,
  toModuleName: string,
  platform: string | null,
): Result<Resolution, FileAndDirCandidates> {
  const modulePath = path.isAbsolute(toModuleName)
    ? resolveWindowsPath(toModuleName)
    : path.join(path.dirname(context.originModulePath), toModuleName);
  const redirectedPath = context.redirectModulePath(modulePath);
  if (redirectedPath === false) {
    return resolvedAs({type: 'empty'});
  }

  const dirPath = path.dirname(redirectedPath);
  const fileName = path.basename(redirectedPath);
  const fileResult = resolveFile(context, dirPath, fileName, platform);
  if (fileResult.type === 'resolved') {
    return fileResult;
  }
  const dirResult = resolvePackageEntryPoint(context, redirectedPath, platform);
  if (dirResult.type === 'resolved') {
    return dirResult;
  }
  return failedFor({file: fileResult.candidates, dir: dirResult.candidates});
}

/**
 * Resolve a module as a Haste module or package. For example we might try to
 * resolve `Foo`, that is provided by file `/smth/Foo.js`. Or, in the case of
 * a Haste package, it could be `/smth/Foo/index.js`.
 */
function resolveHasteName(
  context: ResolutionContext,
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
  const result = resolvePackage(context, potentialModulePath, platform);
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
 * Resolve a package entry point or subpath target.
 *
 * This should be used when resolving a bare import specifier prefixed with the
 * package name. Use `resolveModulePath` instead to scope to legacy "browser"
 * spec behaviour, which is also applicable to relative and absolute imports.
 */
function resolvePackage(
  context: ResolutionContext,
  /**
   * The absolute path to a file or directory that may be contained within an
   * npm package, e.g. from being joined with `context.extraNodeModules`.
   */
  modulePath: string,
  platform: string | null,
): Result<Resolution, FileAndDirCandidates> {
  if (context.unstable_enablePackageExports) {
    const pkg = context.getPackageForModule(modulePath);
    const exportsField = pkg?.packageJson.exports;

    if (pkg != null && exportsField != null) {
      let conditionNamesOverride = context.unstable_conditionNames;

      // HACK!: Do not assert the "import" condition for `@babel/runtime`. This
      // is a workaround for ESM <-> CJS interop, as we need the CJS versions of
      // `@babel/runtime` helpers.
      // TODO(T154157178): Remove with better "require"/"import" solution
      if (pkg.packageJson.name === '@babel/runtime') {
        conditionNamesOverride = context.unstable_conditionNames.filter(
          condition => condition !== 'import',
        );
      }

      try {
        const packageExportsResult = resolvePackageTargetFromExports(
          {...context, unstable_conditionNames: conditionNamesOverride},
          pkg.rootPath,
          modulePath,
          exportsField,
          platform,
        );

        if (packageExportsResult != null) {
          return resolvedAs(packageExportsResult);
        }
      } catch (e) {
        if (e instanceof PackagePathNotExportedError) {
          context.unstable_logWarning(
            e.message +
              ' Falling back to file-based resolution. Consider updating the ' +
              'call site or asking the package maintainer(s) to expose this API.',
          );
        } else if (e instanceof InvalidPackageConfigurationError) {
          context.unstable_logWarning(
            e.message + ' Falling back to file-based resolution.',
          );
        } else {
          throw e;
        }
      }
    }
  }

  return resolveModulePath(context, modulePath, platform);
}

/**
 * Attempt to resolve a module path as an npm package entry point, or resolve as
 * a file if no `package.json` file is present.
 *
 * Implements legacy (non-exports) package resolution behaviour based on the
 * ["browser" field spec](https://github.com/defunctzombie/package-browser-field-spec):
 * - Looks for a "main" entry point based on `context.mainFields`.
 * - Considers any "main" subpaths after expending source and platform-specific
 *     extensions, e.g. `./lib/index` -> `./lib/index.ios.js`.
 * - Falls back to a child `index.js` file, e.g. `./lib` -> `./lib/index.js`.
 */
function resolvePackageEntryPoint(
  context: ResolutionContext,
  packagePath: string,
  platform: string | null,
): Result<Resolution, FileCandidates> {
  const packageJsonPath = path.join(packagePath, 'package.json');

  if (!context.doesFileExist(packageJsonPath)) {
    return resolveFile(context, packagePath, 'index', platform);
  }

  const packageInfo = {
    rootPath: path.dirname(packageJsonPath),
    packageJson: context.getPackage(packageJsonPath) ?? {},
  };

  const mainModulePath = path.join(
    packageInfo.rootPath,
    getPackageEntryPoint(context, packageInfo, platform),
  );

  const fileResult = resolveFile(
    context,
    path.dirname(mainModulePath),
    path.basename(mainModulePath),
    platform,
  );

  if (fileResult.type === 'resolved') {
    return fileResult;
  }

  // Fallback: Attempt to resolve any file at <subpath>/index.js
  const indexResult = resolveFile(context, mainModulePath, 'index', platform);

  if (indexResult.type !== 'resolved') {
    throw new InvalidPackageError({
      packageJsonPath,
      mainModulePath,
      fileCandidates: fileResult.candidates,
      indexCandidates: indexResult.candidates,
    });
  }

  return indexResult;
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
  context: ResolutionContext,
  dirPath: string,
  fileName: string,
  platform: string | null,
): Result<Resolution, FileCandidates> {
  if (isAssetFile(fileName, context.assetExts)) {
    const assetResolutions = resolveAsset(
      context,
      path.join(dirPath, fileName),
    );

    if (assetResolutions == null) {
      return failedFor({type: 'asset', name: fileName});
    }

    return resolvedAs(assetResolutions);
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

type SourceFileContext = $ReadOnly<{
  ...ResolutionContext,
  candidateExts: Array<string>,
  filePathPrefix: string,
}>;

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

/**
 * For a particular extension, ex. `js`, we want to try a few possibilities,
 * such as `foo.ios.js`, `foo.native.js`, and of course `foo.js`. Return the
 * full path of the resolved module, `null` if no resolution could be found, or
 * `{type: 'empty'}` if redirected to an empty module.
 */
function resolveSourceFileForAllExts(
  context: SourceFileContext,
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

/**
 * We try to resolve a single possible extension. If it doesn't exist, then
 * we make sure to add the extension to a list of candidates for reporting.
 */
function resolveSourceFileForExt(
  context: SourceFileContext,
  extension: string,
): SourceFileResolution {
  const filePath = `${context.filePathPrefix}${extension}`;
  const redirectedPath =
    // Any redirections for the bare path have already happened
    extension !== '' ? context.redirectModulePath(filePath) : filePath;
  if (redirectedPath === false) {
    return {type: 'empty'};
  }
  if (context.unstable_getRealPath) {
    const maybeRealPath = context.unstable_getRealPath(redirectedPath);
    if (maybeRealPath != null) {
      return maybeRealPath;
    }
  } else if (context.doesFileExist(redirectedPath)) {
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

module.exports = resolve;
