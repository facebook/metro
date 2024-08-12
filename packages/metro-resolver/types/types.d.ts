/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import {TransformResultDependency} from 'metro';

export type Result<TResolution, TCandidates> =
  | {readonly type: 'resolved'; readonly resolution: TResolution}
  | {readonly type: 'failed'; readonly candidates: TCandidates};

export type Resolution = FileResolution | Readonly<{type: 'empty'}>;

export type SourceFileResolution = Readonly<{
  type: 'sourceFile';
  filePath: string;
}>;
export type AssetFileResolution = ReadonlyArray<string>;
export type AssetResolution = Readonly<{
  type: 'assetFiles';
  filePaths: AssetFileResolution;
}>;
export type FileResolution = AssetResolution | SourceFileResolution;

export interface FileAndDirCandidates {
  readonly dir: FileCandidates;
  readonly file: FileCandidates;
}

/**
 * This is a way to describe what files we tried to look for when resolving
 * a module name as file. This is mainly used for error reporting, so that
 * we can explain why we cannot resolve a module.
 */
export type FileCandidates =
  // We only tried to resolve a specific asset.
  | {readonly type: 'asset'; readonly name: string}
  // We attempted to resolve a name as being a source file (ex. JavaScript,
  // JSON...), in which case there can be several extensions we tried, for
  // example `/js/foo.ios.js`, `/js/foo.js`, etc. for a single prefix '/js/foo'.
  | {
      readonly type: 'sourceFile';
      filePathPrefix: string;
      readonly candidateExts: ReadonlyArray<string>;
    };

export type ExportMap = Readonly<{
  [subpathOrCondition: string]: ExportMap | string | null;
}>;

export interface PackageJson {
  readonly name?: string;
  readonly main?: string;
  readonly exports?: string | ExportMap;
}

export interface PackageInfo {
  readonly packageJson: PackageJson;
  readonly rootPath: string;
}

export interface PackageForModule extends PackageInfo {
  /* A system-separated subpath (with no './' prefix) that reflects the subpath
     of the given candidate relative to the returned rootPath. */
  readonly packageRelativePath: string;
}

/**
 * Check existence of a single file.
 */
export type DoesFileExist = (filePath: string) => boolean;
export type IsAssetFile = (fileName: string) => boolean;
/**
 * Performs a lookup against an absolute or project-relative path to determine
 * whether it exists as a file or directory. Follows any symlinks, and returns
 * a real absolute path on existence.
 */
export type FileSystemLookup = (
  absoluteOrProjectRelativePath: string,
) => {exists: false} | {exists: true; type: 'f' | 'd'; realPath: string};

/**
 * Given a directory path and the base asset name, return a list of all the
 * asset file names that match the given base name in that directory. Return
 * null if there's no such named asset. `platform` is used to identify
 * platform-specific assets, ex. `foo.ios.js` instead of a generic `foo.js`.
 */
export type ResolveAsset = (
  dirPath: string,
  assetName: string,
  extension: string,
) => ReadonlyArray<string> | undefined;

export interface ResolutionContext {
  readonly assetExts: ReadonlyArray<string>;
  readonly allowHaste: boolean;
  readonly customResolverOptions: CustomResolverOptions;
  readonly disableHierarchicalLookup: boolean;
  readonly doesFileExist: DoesFileExist;
  readonly extraNodeModules?: {[key: string]: string};

  /**
   * Get the parsed contents of the specified `package.json` file.
   */
  readonly getPackage: (packageJsonPath: string) => PackageJson | null;

  /**
   * Get the closest package scope, parsed `package.json` and relative subpath
   * for a given absolute candidate path (which need not exist), or null if
   * there is no package.json closer than the nearest node_modules directory.
   *
   * @deprecated See https://github.com/facebook/metro/commit/29c77bff31e2475a086bc3f04073f485da8f9ff0
   */
  readonly getPackageForModule: (
    absoluteModulePath: string,
  ) => PackageForModule | null;

  /**
   * The dependency descriptor, within the origin module, corresponding to the
   * current resolution request. This is provided for diagnostic purposes ONLY
   * and may not be used for resolution purposes.
   */
  readonly dependency?: TransformResultDependency;

  /**
   * The ordered list of fields to read in `package.json` to resolve a main
   * entry point based on the "browser" field spec.
   */
  readonly mainFields: ReadonlyArray<string>;

  /**
   * Full path of the module that is requiring or importing the module to be
   * resolved. This may not be the only place this dependency was found,
   * as resolutions can be cached.
   */
  readonly originModulePath: string;

  readonly nodeModulesPaths: ReadonlyArray<string>;
  readonly preferNativePlatform: boolean;
  readonly resolveAsset: ResolveAsset;
  readonly redirectModulePath: (modulePath: string) => string | false;

  /**
   * Given a name, this should return the full path to the file that provides
   * a Haste module of that name. Ex. for `Foo` it may return `/smth/Foo.js`.
   */
  readonly resolveHasteModule: (name: string) => string | undefined;

  /**
   * Given a name, this should return the full path to the package manifest that
   * provides a Haste package of that name. Ex. for `Foo` it may return
   * `/smth/Foo/package.json`.
   */
  readonly resolveHastePackage: (name: string) => string | undefined;

  readonly resolveRequest?: CustomResolver;
  readonly sourceExts: ReadonlyArray<string>;
  unstable_conditionNames: ReadonlyArray<string>;
  unstable_conditionsByPlatform: Readonly<{
    [platform: string]: ReadonlyArray<string>;
  }>;
  unstable_enablePackageExports: boolean;
  unstable_fileSystemLookup?: FileSystemLookup | null;
  unstable_logWarning: (message: string) => void;
}

export interface CustomResolutionContext extends ResolutionContext {
  readonly resolveRequest: CustomResolver;
}

export type CustomResolver = (
  context: CustomResolutionContext,
  moduleName: string,
  platform: string | null,
) => Resolution;

export type CustomResolverOptions = Readonly<{
  [option: string]: unknown;
}>;
