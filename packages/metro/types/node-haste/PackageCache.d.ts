/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<eaea6d7e01d54353f700cdadd60c4bf2>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/node-haste/PackageCache.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import Package from './Package';

type GetClosestPackageFn = (
  absoluteFilePath: string,
) => null | undefined | {packageJsonPath: string; packageRelativePath: string};
export declare class PackageCache {
  _getClosestPackage: GetClosestPackageFn;
  _packageCache: {[filePath: string]: Package};
  _packagePathAndSubpathByModulePath: {
    [filePath: string]:
      | null
      | undefined
      | {packageJsonPath: string; packageRelativePath: string};
  };
  _modulePathsByPackagePath: {
    [filePath: string]: Set<string>;
  };
  constructor(options: {getClosestPackage: GetClosestPackageFn});
  getPackage(filePath: string): Package;
  getPackageOf(
    absoluteModulePath: string,
  ): null | undefined | {pkg: Package; packageRelativePath: string};
  invalidate(filePath: string): void;
}
