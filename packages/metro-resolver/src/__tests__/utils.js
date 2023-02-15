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

import type {ResolutionContext} from '../index';
import invariant from 'invariant';

/**
 * Data structure approximating a file tree. Should be populated with complete
 * paths mapping to file contents.
 */
type MockFileMap = $ReadOnly<{
  [path: string]: ?(string | $ReadOnly<{realPath: ?string}>),
}>;

/**
 * Create a new partial `ResolutionContext` object given a mock file structure.
 * Includes defaults closely matching metro-config, which can be overridden by
 * consuming tests.
 */
export function createResolutionContext(
  fileMap: MockFileMap,
  {enableSymlinks}: $ReadOnly<{enableSymlinks?: boolean}> = {},
): $Diff<ResolutionContext, {originModulePath: string}> {
  return {
    allowHaste: true,
    customResolverOptions: {},
    disableHierarchicalLookup: false,
    extraNodeModules: null,
    getPackage: (packageJsonPath: string) => {
      invariant(
        typeof fileMap[packageJsonPath] === 'string',
        '%s is not a regular file',
        packageJsonPath,
      );
      return JSON.parse(fileMap[packageJsonPath]);
    },
    getPackageForModule: () => null,
    isAssetFile: () => false,
    mainFields: ['browser', 'main'],
    nodeModulesPaths: [],
    preferNativePlatform: false,
    redirectModulePath: (filePath: string) => filePath,
    resolveAsset: (filePath: string) => null,
    resolveHasteModule: (name: string) => null,
    resolveHastePackage: (name: string) => null,
    sourceExts: ['js', 'jsx', 'json', 'ts', 'tsx'],
    unstable_conditionNames: [],
    unstable_conditionsByPlatform: {},
    unstable_enablePackageExports: false,
    ...(enableSymlinks === true
      ? {
          doesFileExist: (filePath: string) =>
            // Should return false unless realpath(filePath) exists. We mock shallow
            // dereferencing.
            fileMap[filePath] != null &&
            (typeof fileMap[filePath] === 'string' ||
              typeof fileMap[filePath].realPath === 'string'),
          unstable_getRealPath: filePath =>
            typeof fileMap[filePath] === 'string'
              ? filePath
              : fileMap[filePath]?.realPath,
        }
      : {
          doesFileExist: (filePath: string) =>
            typeof fileMap[filePath] === 'string',
          unstable_getRealPath: null,
        }),
  };
}
