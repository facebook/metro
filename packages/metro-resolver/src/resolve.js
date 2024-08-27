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

import FailedToResolveNameError from './errors/FailedToResolveNameError';
import FailedToResolvePathError from './errors/FailedToResolvePathError';
import formatFileCandidates from './errors/formatFileCandidates';
import InvalidPackageConfigurationError from './errors/InvalidPackageConfigurationError';
import InvalidPackageError from './errors/InvalidPackageError';
import PackagePathNotExportedError from './errors/PackagePathNotExportedError';
import {resolvePackageTargetFromExports} from './PackageExportsResolve';
import {getPackageEntryPoint} from './PackageResolve';
import resolveAsset from './resolveAsset';
import isAssetFile from './utils/isAssetFile';
import path from 'path';

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

  /**
   * At this point, realModuleName is not a "direct" (absolute or relative)
   * import, so it's either Haste name or a package specifier.
   */

  if (context.allowHaste) {
    const normalizedName = normalizePath(realModuleName);
    const result = resolveHasteName(context, normalizedName, platform);
    if (result.type === 'resolved') {
      return result.resolution;
    }
  }

  /**
   * realModuleName is now a package specifier.
   */

  const {disableHierarchicalLookup} = context;

  const nodeModulesPaths = [];
  let next = path.dirname(originModulePath);

  if (!disableHierarchicalLookup) {
    let candidate;
    do {
      candidate = next;
      const nodeModulesPath = candidate.endsWith(path.sep)
        ? candidate + 'node_modules'
        : candidate + path.sep + 'node_modules';
      nodeModulesPaths.push(nodeModulesPath);
      next = path.dirname(candidate);
    } while (candidate !== next);
  }

  // Fall back to `nodeModulesPaths` after hierarchical lookup, similar to $NODE_PATH
  nodeModulesPaths.push(...context.nodeModulesPaths);

  const extraPaths = [];

  const parsedSpecifier = parsePackageSpecifier(realModuleName);

  const {extraNodeModules} = context;
  if (extraNodeModules && extraNodeModules[parsedSpecifier.packageName]) {
    const newPackageName = extraNodeModules[parsedSpecifier.packageName];
    extraPaths.push(path.join(newPackageName, parsedSpecifier.posixSubpath));
  }

  const allDirPaths = nodeModulesPaths
    .map(nodeModulePath => {
      let lookupResult = null;
      if (context.unstable_fileSystemLookup) {
        // Insight: The module can only exist if there is a `node_modules` at
        // this path. Redirections cannot succeed, because we will never look
        // beyond a node_modules path segment for finding the closest
        // package.json. Moreover, if the specifier contains a '/' separator,
        // the first part *must* be a real directory, because it is the
        // shallowest path that can possibly contain a redirecting package.json.
        const mustBeDirectory =
          parsedSpecifier.posixSubpath !== '.' ||
          parsedSpecifier.packageName.length > parsedSpecifier.firstPart.length
            ? nodeModulePath + path.sep + parsedSpecifier.firstPart
            : nodeModulePath;
        lookupResult = context.unstable_fileSystemLookup(mustBeDirectory);
        if (!lookupResult.exists || lookupResult.type !== 'd') {
          return null;
        }
      }
      return path.join(nodeModulePath, realModuleName);
    })
    .filter(Boolean)
    .concat(extraPaths);
  for (let i = 0; i < allDirPaths.length; ++i) {
    const candidate = context.redirectModulePath(allDirPaths[i]);

    if (candidate === false) {
      return {type: 'empty'};
    }

    // candidate should be absolute here - we assume that redirectModulePath
    // always returns an absolute path when given an absolute path.
    const result = resolvePackage(context, candidate, platform);
    if (result.type === 'resolved') {
      return result.resolution;
    }
  }

  throw new FailedToResolveNameError(nodeModulesPaths, extraPaths);
}

function parsePackageSpecifier(specifier: string) {
  const normalized =
    path.sep === '/' ? specifier : specifier.replaceAll('\\', '/');
  const firstSepIdx = normalized.indexOf('/');
  if (normalized.startsWith('@') && firstSepIdx !== -1) {
    const secondSepIdx = normalized.indexOf('/', firstSepIdx + 1);
    if (secondSepIdx === -1) {
      return {
        firstPart: normalized.slice(0, firstSepIdx),
        packageName: normalized,
        posixSubpath: '.',
      };
    }
    return {
      firstPart: normalized.slice(0, firstSepIdx),
      packageName: normalized.slice(0, secondSepIdx),
      posixSubpath: '.' + normalized.slice(secondSepIdx),
    };
  }
  if (firstSepIdx === -1) {
    return {
      firstPart: normalized,
      packageName: normalized,
      posixSubpath: '.',
    };
  }
  const packageName = normalized.slice(0, firstSepIdx);
  return {
    firstPart: packageName,
    packageName,
    posixSubpath: '.' + normalized.slice(firstSepIdx),
  };
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

  const fileResult: ?Result<Resolution, FileCandidates> =
    // require('./foo/') should never resolve to ./foo.js - a trailing slash
    // implies we should resolve as a directory only.
    redirectedPath.endsWith(path.sep)
      ? null
      : resolveFile(context, dirPath, fileName, platform);

  if (fileResult != null && fileResult.type === 'resolved') {
    return fileResult;
  }
  const dirResult = resolvePackageEntryPoint(context, redirectedPath, platform);
  if (dirResult.type === 'resolved') {
    return dirResult;
  }
  return failedFor({
    file: fileResult?.candidates ?? null,
    dir: dirResult.candidates,
  });
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
        [opts.candidates.file, opts.candidates.dir]
          .filter(Boolean)
          .map(candidates => `  * \`${formatFileCandidates(candidates)}\``)
          .join('\n'),
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
  absoluteCandidatePath: string,
  platform: string | null,
): Result<Resolution, FileAndDirCandidates> {
  if (context.unstable_enablePackageExports) {
    const pkg = context.getPackageForModule(absoluteCandidatePath);
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
          absoluteCandidatePath,
          pkg.packageRelativePath,
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

  return resolveModulePath(context, absoluteCandidatePath, platform);
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
  const dirLookup = context.unstable_fileSystemLookup?.(packagePath);

  if (
    dirLookup != null &&
    (dirLookup.exists === false || dirLookup.type !== 'd')
  ) {
    return failedFor({
      type: 'sourceFile',
      filePathPrefix: packagePath,
      candidateExts: [],
    });
  }

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
  if (context.preferNativePlatform && sourceExt !== '') {
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
  if (context.unstable_fileSystemLookup) {
    const lookupResult = context.unstable_fileSystemLookup(redirectedPath);
    if (lookupResult.exists && lookupResult.type === 'f') {
      return lookupResult.realPath;
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
