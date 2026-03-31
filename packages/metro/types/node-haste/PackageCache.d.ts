/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<768dba0958b531c8edd43c2df24e25f6>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/node-haste/PackageCache.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {PackageJson} from 'metro-resolver/private/types';

type GetClosestPackageFn = (
  absoluteFilePath: string,
) => null | undefined | {packageJsonPath: string; packageRelativePath: string};
type PackageForModule = Readonly<{
  packageJson: PackageJson;
  rootPath: string;
  packageRelativePath: string;
}>;
export declare class PackageCache {
  constructor(options: {getClosestPackage: GetClosestPackageFn});
  getPackage(
    filePath: string,
  ): Readonly<{rootPath: string; packageJson: PackageJson}>;
  getPackageForModule(
    absoluteModulePath: string,
  ): null | undefined | PackageForModule;
  invalidate(filePath: string): void;
}
