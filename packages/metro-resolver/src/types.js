/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

'use strict';

export type Result<+TResolution, +TCandidates> =
  | {+type: 'resolved', +resolution: TResolution}
  | {+type: 'failed', +candidates: TCandidates};

export type Resolution = FileResolution | {+type: 'empty'};

export type SourceFileResolution = $ReadOnly<{
  type: 'sourceFile',
  filePath: string,
}>;
export type AssetFileResolution = $ReadOnlyArray<string>;
export type AssetResolution = $ReadOnly<{
  type: 'assetFiles',
  filePaths: AssetFileResolution,
}>;
export type FileResolution = AssetResolution | SourceFileResolution;

export type FileAndDirCandidates = {
  +dir: FileCandidates,
  +file: FileCandidates,
};

/**
 * This is a way to describe what files we tried to look for when resolving
 * a module name as file. This is mainly used for error reporting, so that
 * we can explain why we cannot resolve a module.
 */
export type FileCandidates =
  // We only tried to resolve a specific asset.
  | {+type: 'asset', +name: string}
  // We attempted to resolve a name as being a source file (ex. JavaScript,
  // JSON...), in which case there can be several extensions we tried, for
  // example `/js/foo.ios.js`, `/js/foo.js`, etc. for a single prefix '/js/foo'.
  | {
      +type: 'sourceFile',
      filePathPrefix: string,
      +candidateExts: $ReadOnlyArray<string>,
    };

export type ExportMap = $ReadOnly<{
  [subpathOrCondition: string]: string | ExportMap | null,
}>;

/** "exports" mapping where values may be legacy Node.js <13.7 array format. */
export type ExportMapWithFallbacks = $ReadOnly<{
  [subpath: string]: $Values<ExportMap> | ExportValueWithFallback,
}>;

/** "exports" subpath value when in legacy Node.js <13.7 array format. */
export type ExportValueWithFallback =
  | $ReadOnlyArray<ExportMap | string>
  // JSON can also contain exotic nested array structure, which will not be parsed
  | $ReadOnlyArray<$ReadOnlyArray<mixed>>;

export type ExportsField =
  | string
  | $ReadOnlyArray<string>
  | ExportValueWithFallback
  | ExportMap
  | ExportMapWithFallbacks;

export type PackageJson = $ReadOnly<{
  name?: string,
  main?: string,
  exports?: ExportsField,
  ...
}>;

export type PackageInfo = $ReadOnly<{
  packageJson: PackageJson,
  rootPath: string,
}>;

/**
 * Check existence of a single file.
 */
export type DoesFileExist = (filePath: string) => boolean;
export type GetRealPath = (path: string) => ?string;

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
) => ?$ReadOnlyArray<string>;

export type ResolutionContext = $ReadOnly<{
  allowHaste: boolean,
  assetExts: $ReadOnlySet<string>,
  customResolverOptions: CustomResolverOptions,
  disableHierarchicalLookup: boolean,
  doesFileExist: DoesFileExist,
  extraNodeModules: ?{[string]: string, ...},

  /**
   * Get the parsed contents of the specified `package.json` file.
   */
  getPackage: (packageJsonPath: string) => ?PackageJson,

  /**
   * Get the package information and parsed `package.json` file for for a given
   * module path, if it is contained within an npm package.
   *
   * @deprecated See https://github.com/facebook/metro/commit/29c77bff31e2475a086bc3f04073f485da8f9ff0
   */
  getPackageForModule: (modulePath: string) => ?PackageInfo,

  /**
   * The ordered list of fields to read in `package.json` to resolve a main
   * entry point based on the "browser" field spec.
   */
  mainFields: $ReadOnlyArray<string>,

  /**
   * Full path of the module that is requiring or importing the module to be
   * resolved.
   */
  originModulePath: string,

  nodeModulesPaths: $ReadOnlyArray<string>,
  preferNativePlatform: boolean,
  resolveAsset: ResolveAsset,
  redirectModulePath: (modulePath: string) => string | false,

  /**
   * Given a name, this should return the full path to the file that provides
   * a Haste module of that name. Ex. for `Foo` it may return `/smth/Foo.js`.
   */
  resolveHasteModule: (name: string) => ?string,

  /**
   * Given a name, this should return the full path to the package manifest that
   * provides a Haste package of that name. Ex. for `Foo` it may return
   * `/smth/Foo/package.json`.
   */
  resolveHastePackage: (name: string) => ?string,

  resolveRequest?: ?CustomResolver,
  sourceExts: $ReadOnlyArray<string>,
  unstable_conditionNames: $ReadOnlyArray<string>,
  unstable_conditionsByPlatform: $ReadOnly<{
    [platform: string]: $ReadOnlyArray<string>,
  }>,
  unstable_enablePackageExports: boolean,
  unstable_getRealPath?: ?GetRealPath,
  unstable_logWarning: (message: string) => void,
}>;

export type CustomResolutionContext = $ReadOnly<{
  ...ResolutionContext,
  resolveRequest: CustomResolver,
}>;

export type CustomResolver = (
  context: CustomResolutionContext,
  moduleName: string,
  platform: string | null,
) => Resolution;

export type CustomResolverOptions = {
  __proto__: null,
  +[string]: mixed,
  ...
};
