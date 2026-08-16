/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {PackageCache} from '../PackageCache';
import type {DirExistsFn} from './ModuleResolution';
import type {ConfigT} from 'metro-config';
import type {FileSystem, HasteMap} from 'metro-file-map';
import type {FileSystemLookup} from 'metro-resolver';

import getSchemeResolvers from '../../lib/getSchemeResolvers';
import {ModuleResolver} from './ModuleResolution';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The default `dirExists` implementation, which consults the real filesystem
 * rather than the `FileSystem` the rest of resolution is based on.
 *
 * TODO: Use `fileSystem` here too - this is inconsistent with every other
 * resolver hook and incorrect for virtual filesystems.
 */
export const dirExistsSync: DirExistsFn = (filePath: string) => {
  try {
    return fs.lstatSync(filePath).isDirectory();
  } catch (e) {}
  return false;
};

export type CreateModuleResolverOptions = Readonly<{
  config: ConfigT,
  fileSystem: FileSystem,
  hasteMap: HasteMap,
  packageCache: PackageCache,
  /**
   * Defaults to `dirExistsSync`, which stats the real filesystem. Consumers
   * backed by a virtual filesystem should supply their own.
   */
  dirExists?: DirExistsFn,
}>;

export default function createModuleResolver({
  config,
  fileSystem,
  hasteMap,
  packageCache,
  dirExists = dirExistsSync,
}: CreateModuleResolverOptions): ModuleResolver {
  const fileSystemLookup = (filePath: string): ReturnType<FileSystemLookup> => {
    const result = fileSystem.lookup(filePath);
    if (result.exists) {
      return {
        exists: true,
        realPath: result.realPath,
        type: result.type,
      };
    }
    return {exists: false};
  };

  return new ModuleResolver({
    assetExts: new Set(config.resolver.assetExts),
    dirExists,
    disableHierarchicalLookup: config.resolver.disableHierarchicalLookup,
    doesFileExist: (filePath: string) => fileSystem.exists(filePath),
    emptyModulePath: config.resolver.emptyModulePath,
    extraNodeModules: config.resolver.extraNodeModules,
    fileSystemLookup,
    getHasteModulePath: (name, platform) =>
      hasteMap.getModule(name, platform, true),
    getHastePackagePath: (name, platform) =>
      hasteMap.getPackage(name, platform, true),
    getPackage: (packageJsonPath: string) => {
      try {
        return packageCache.getPackage(packageJsonPath).packageJson ?? null;
      } catch {
        // Non-existence or malformed JSON, we treat both as non-existent
        return null;
      }
    },
    getPackageForModule: (absolutePath: string) =>
      packageCache.getPackageForModule(absolutePath),
    mainFields: config.resolver.resolverMainFields,
    nodeModulesPaths: config.resolver.nodeModulesPaths,
    preferNativePlatform: true,
    projectRoot: config.projectRoot,
    reporter: config.reporter,
    resolveAsset: (dirPath: string, assetName: string, extension: string) => {
      const basePath = dirPath + path.sep + assetName;
      const assets = [
        basePath + extension,
        ...config.resolver.assetResolutions.map(
          resolution => basePath + '@' + resolution + 'x' + extension,
        ),
      ]
        .map(assetPath => fileSystemLookup(assetPath).realPath)
        .filter(Boolean);

      return assets.length ? assets : null;
    },
    resolveRequest: config.resolver.resolveRequest,
    schemeResolvers: {
      ...getSchemeResolvers(),
      ...config.resolver.schemeResolvers,
    },
    sourceExts: config.resolver.sourceExts,
    unstable_conditionNames: config.resolver.unstable_conditionNames,
    unstable_conditionsByPlatform:
      config.resolver.unstable_conditionsByPlatform,
    unstable_enablePackageExports:
      config.resolver.unstable_enablePackageExports,
    unstable_incrementalResolution:
      config.resolver.unstable_incrementalResolution,
  });
}
