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

/**
 * Data structure approximating a file tree. Should be populated with complete
 * paths mapping to file contents.
 */
type MockFileMap = {[path: string]: string};

/**
 * Create a new partial `ResolutionContext` object given a mock file structure.
 * Includes defaults closely matching metro-config, which can be overridden by
 * consuming tests.
 */
export function createResolutionContext(
  fileMap: MockFileMap,
): $Diff<ResolutionContext, {originModulePath: string}> {
  return {
    allowHaste: true,
    customResolverOptions: {},
    disableHierarchicalLookup: false,
    doesFileExist: (filePath: string) => filePath in fileMap,
    extraNodeModules: null,
    getPackage: (packageJsonPath: string) =>
      JSON.parse(fileMap[packageJsonPath]),
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
  };
}
