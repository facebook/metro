/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
