/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {
  BundlerResolution,
  TransformResultDependency,
} from '../../DeltaBundler/types';
import type {Reporter} from '../../lib/reporting';
import type {ResolverInputOptions} from '../../shared/types';
import type {
  CustomResolver,
  DoesFileExist,
  FileCandidates,
  FileSystemLookup,
  Resolution,
  ResolveAsset,
} from 'metro-resolver';
import type {PackageForModule, PackageJson} from 'metro-resolver/private/types';

export type DirExistsFn = (filePath: string) => boolean;
export type Packageish = {path: string; read(): PackageJson};
export type Moduleish = {readonly path: string};
export type PackageishCache<TPackage> = {
  getPackage(
    name: string,
    platform?: string,
    supportsNativePlatform?: boolean,
  ): TPackage;
  getPackageOf(
    absolutePath: string,
  ): null | undefined | {pkg: TPackage; packageRelativePath: string};
};
type Options<TPackage> = Readonly<{
  assetExts: ReadonlySet<string>;
  dirExists: DirExistsFn;
  disableHierarchicalLookup: boolean;
  doesFileExist: DoesFileExist;
  emptyModulePath: string;
  extraNodeModules: null | undefined | object;
  fileSystemLookup: FileSystemLookup;
  getHasteModulePath: (
    name: string,
    platform: null | undefined | string,
  ) => null | undefined | string;
  getHastePackagePath: (
    name: string,
    platform: null | undefined | string,
  ) => null | undefined | string;
  mainFields: ReadonlyArray<string>;
  packageCache: PackageishCache<TPackage>;
  nodeModulesPaths: ReadonlyArray<string>;
  preferNativePlatform: boolean;
  projectRoot: string;
  reporter: Reporter;
  resolveAsset: ResolveAsset;
  resolveRequest: null | undefined | CustomResolver;
  sourceExts: ReadonlyArray<string>;
  unstable_conditionNames: ReadonlyArray<string>;
  unstable_conditionsByPlatform: Readonly<{
    [platform: string]: ReadonlyArray<string>;
  }>;
  unstable_enablePackageExports: boolean;
  unstable_incrementalResolution: boolean;
}>;
export declare class ModuleResolver<TPackage extends Packageish> {
  _options: Options<TPackage>;
  _projectRootFakeModulePath: string;
  _cachedEmptyModule: null | undefined | BundlerResolution;
  constructor(options: Options<TPackage>);
  _getEmptyModule(): BundlerResolution;
  resolveDependency(
    originModulePath: string,
    dependency: TransformResultDependency,
    allowHaste: boolean,
    platform: string | null,
    resolverOptions: ResolverInputOptions,
  ): BundlerResolution;
  _getPackage: (packageJsonPath: string) => null | undefined | PackageJson;
  _getPackageForModule: (
    absolutePath: string,
  ) => null | undefined | PackageForModule;
  /**
   * TODO: Return Resolution instead of coercing to BundlerResolution here
   */
  _getFileResolvedModule(resolution: Resolution): BundlerResolution;
  _logWarning: (message: string) => void;
  _removeRoot(candidates: FileCandidates): FileCandidates;
}
export declare class UnableToResolveError extends Error {
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
  cause: null | undefined | Error;
  /**
   * Fixed type field in common with other Metro build errors.
   */
  readonly type: 'UnableToResolveError';
  constructor(
    originModulePath: string,
    targetModuleName: string,
    message: string,
    options?: Readonly<{
      dependency?: null | undefined | TransformResultDependency;
      cause?: Error;
    }>,
  );
  buildCodeFrameMessage(
    dependency: null | undefined | TransformResultDependency,
  ): null | undefined | string;
}
