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
import type {ConfigT} from 'metro-config';
import type {FileSystem, HasteMap} from 'metro-file-map';
import type {FileSystemLookup, FileSystemOpenDir} from 'metro-resolver';

import getSchemeResolvers from '../../lib/getSchemeResolvers';
import {ModuleResolver} from './ModuleResolution';
import path from 'node:path';

export type CreateModuleResolverOptions = Readonly<{
  config: ConfigT,
  fileSystem: FileSystem,
  hasteMap: HasteMap,
  packageCache: PackageCache,
}>;

export default function createModuleResolver({
  config,
  fileSystem,
  hasteMap,
  packageCache,
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

  const openDir = fileSystem.openDir?.bind(fileSystem);
  const fileSystemOpenDir: FileSystemOpenDir | void =
    openDir != null
      ? filePath => {
          const opened = openDir(filePath);
          if (opened == null) {
            return null;
          }
          return {
            realPath: opened.realPath,
            lookup(basename) {
              const result = opened.lookup(basename);
              if (result.exists) {
                return {
                  exists: true,
                  realPath: result.realPath,
                  type: result.type,
                };
              }
              return {exists: false};
            },
          };
        }
      : undefined;

  return new ModuleResolver({
    assetExts: new Set(config.resolver.assetExts),
    disableHierarchicalLookup: config.resolver.disableHierarchicalLookup,
    doesFileExist: (filePath: string) => fileSystem.exists(filePath),
    emptyModulePath: config.resolver.emptyModulePath,
    extraNodeModules: config.resolver.extraNodeModules,
    fileSystemLookup,
    fileSystemOpenDir,
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
      const names = [
        assetName + extension,
        ...config.resolver.assetResolutions.map(
          resolution => assetName + '@' + resolution + 'x' + extension,
        ),
      ];
      const opened = fileSystemOpenDir?.(dirPath);
      if (fileSystemOpenDir != null && opened == null) {
        return null;
      }
      const assets = names
        .map(name => {
          const result =
            opened != null
              ? opened.lookup(name)
              : fileSystemLookup(path.join(dirPath, name));
          // A directory such as `node_modules/lodash.zip` is not an asset, and
          // must fall through to directory (package) resolution.
          return result.exists && result.type === 'f' ? result.realPath : null;
        })
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
