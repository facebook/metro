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
import FailedToResolveUnsupportedError from './errors/FailedToResolveUnsupportedError';
import formatFileCandidates from './errors/formatFileCandidates';
import InvalidPackageConfigurationError from './errors/InvalidPackageConfigurationError';
import InvalidPackageError from './errors/InvalidPackageError';
import PackagePathNotExportedError from './errors/PackagePathNotExportedError';
import {resolvePackageTargetFromExports} from './PackageExportsResolve';
import {getPackageEntryPoint, redirectModulePath} from './PackageResolve';
import resolveAsset from './resolveAsset';
import isAssetFile from './utils/isAssetFile';
import path from 'path';

type ParsedBareSpecifier = $ReadOnly<{
  isSinglePart: boolean,
  isValidPackageName: boolean,
  firstPart: string,
  normalizedSpecifier: string,
  packageName: string,
  posixSubpath: string,
}>;

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

  if (moduleName.startsWith('#')) {
    throw new FailedToResolveUnsupportedError(
      'Specifier starts with "#" but subpath imports are not currently supported.',
    );
  }

  const realModuleName = redirectModulePath(context, moduleName);

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
   * import, so it's a bare specifier - for our purposes either Haste name
   * or a package specifier.
   */

  const parsedSpecifier = parseBareSpecifier(realModuleName);

  if (context.allowHaste) {
    if (parsedSpecifier.isSinglePart) {
      const result = context.resolveHasteModule(parsedSpecifier.firstPart);
      if (result != null) {
        return {type: 'sourceFile', filePath: result};
      }
    }
    if (parsedSpecifier.isValidPackageName) {
      const result = resolveHastePackage(context, parsedSpecifier, platform);
      if (result.type === 'resolved') {
        return result.resolution;
      }
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

  const {extraNodeModules} = context;
  if (extraNodeModules && extraNodeModules[parsedSpecifier.packageName]) {
    const newPackageName = extraNodeModules[parsedSpecifier.packageName];
    extraPaths.push(path.join(newPackageName, parsedSpecifier.posixSubpath));
  }

  const allDirPaths = nodeModulesPaths
    .map(nodeModulePath => {
      let lookupResult = null;
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
      lookupResult = context.fileSystemLookup(mustBeDirectory);
      if (!lookupResult.exists || lookupResult.type !== 'd') {
        return null;
      }
      return path.join(nodeModulePath, realModuleName);
    })
    .filter(Boolean)
    .concat(extraPaths);
  for (let i = 0; i < allDirPaths.length; ++i) {
    const candidate = redirectModulePath(context, allDirPaths[i]);

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

function parseBareSpecifier(specifier: string): ParsedBareSpecifier {
  const normalized =
    path.sep === '/' ? specifier : specifier.replaceAll('\\', '/');
  const firstSepIdx = normalized.indexOf('/');
  if (normalized.startsWith('@') && firstSepIdx !== -1) {
    const secondSepIdx = normalized.indexOf('/', firstSepIdx + 1);
    if (secondSepIdx === -1) {
      // @foo/bar (valid scoped, no subpath)
      return {
        isSinglePart: false,
        isValidPackageName: true,
        firstPart: normalized.slice(0, firstSepIdx),
        normalizedSpecifier: normalized,
        packageName: normalized,
        posixSubpath: '.',
      };
    }
    // @foo/bar[/subpath] (valid scoped with subpath)
    return {
      isSinglePart: false,
      isValidPackageName: true,
      firstPart: normalized.slice(0, firstSepIdx),
      normalizedSpecifier: normalized,
      packageName: normalized.slice(0, secondSepIdx),
      posixSubpath: '.' + normalized.slice(secondSepIdx),
    };
  }
  // foo or @foo, no subpath. Valid if doesn't start with '@'.
  if (firstSepIdx === -1) {
    return {
      isSinglePart: true,
      isValidPackageName: !normalized.startsWith('@'),
      firstPart: normalized,
      normalizedSpecifier: normalized,
      packageName: normalized,
      posixSubpath: '.',
    };
  }
  const packageName = normalized.slice(0, firstSepIdx);
  // foo/subpath, valid, not scoped, with subpath
  return {
    isSinglePart: false,
    isValidPackageName: true,
    firstPart: packageName,
    normalizedSpecifier: normalized,
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
  // System-separated absolute path
  const modulePath = path.isAbsolute(toModuleName)
    ? path.sep === '/'
      ? toModuleName
      : toModuleName.replaceAll('/', '\\')
    : path.join(path.dirname(context.originModulePath), toModuleName);
  const redirectedPath = redirectModulePath(context, modulePath);
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
 * Resolve a specifier as a Haste package.
 */
function resolveHastePackage(
  context: ResolutionContext,
  {
    normalizedSpecifier: moduleName,
    packageName,
    posixSubpath: pathInModule,
  }: ParsedBareSpecifier,
  platform: string | null,
): Result<Resolution, void> {
  const packageJsonPath = context.resolveHastePackage(packageName);
  if (packageJsonPath == null) {
    return failedFor();
  }
  const potentialModulePath = path.join(packageJsonPath, '..', pathInModule);
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
        `subpath \`${opts.pathInModule}\` could not be found within ` +
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
  const dirLookup = context.fileSystemLookup(packagePath);
  if (dirLookup.exists == false || dirLookup.type !== 'd') {
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
    extension !== '' ? redirectModulePath(context, filePath) : filePath;
  if (redirectedPath === false) {
    return {type: 'empty'};
  }
  const lookupResult = context.fileSystemLookup(redirectedPath);
  if (lookupResult.exists && lookupResult.type === 'f') {
    return lookupResult.realPath;
  }
  context.candidateExts.push(extension);
  return null;
}

function isRelativeImport(filePath: string) {
  return /^[.][.]?(?:[/]|$)/.test(filePath);
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
