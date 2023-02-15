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
import type {PackageJson} from '../types';

import path from 'path';

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
    isAssetFile: () => false,
    mainFields: ['browser', 'main'],
    nodeModulesPaths: [],
    preferNativePlatform: false,
    redirectModulePath: (filePath: string) => filePath,
    resolveAsset: (filePath: string) => null,
    resolveHasteModule: (name: string) => null,
    resolveHastePackage: (name: string) => null,
    sourceExts: ['js', 'jsx', 'json', 'ts', 'tsx'],
    unstable_conditionNames: ['import', 'require'],
    unstable_conditionsByPlatform: {
      web: ['browser'],
    },
    unstable_enablePackageExports: false,
    ...createPackageAccessors(fileMap),
  };
}

/**
 * Create `getPackage` and `getPackageForModule` accessor properties on
 * `ResolutionContext` based on the input mock file/package.json map.
 */
export function createPackageAccessors(
  fileOrPackageJsonMap: MockFileMap | {[path: string]: PackageJson},
): $ReadOnly<{
  getPackage: ResolutionContext['getPackage'],
  getPackageForModule: ResolutionContext['getPackageForModule'],
}> {
  const getPackage = (packageJsonPath: string) => {
    const contents = fileOrPackageJsonMap[packageJsonPath];

    if (typeof contents === 'string') {
      return JSON.parse(contents);
    }

    if (contents != null) {
      return contents;
    }

    return null;
  };
  const getPackageForModule = (modulePath: string) => {
    const parsedPath = path.parse(modulePath);
    const root = parsedPath.root;
    let dir = path.join(parsedPath.dir, parsedPath.name);

    do {
      const candidate = path.join(dir, 'package.json');
      const packageJson = getPackage(candidate);

      if (packageJson != null) {
        return {
          rootPath: dir,
          packageJson,
        };
      }

      dir = path.dirname(dir);
    } while (dir !== '.' && dir !== root);

    return null;
  };

  return {
    getPackage,
    getPackageForModule,
  };
}
