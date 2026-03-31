/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<6ff79afd34ade1c04dbdd6ae089a83ef>>
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
export declare class PackageCache {
  _getClosestPackage: GetClosestPackageFn;
  _packageCache: {
    [filePath: string]: {rootPath: string; packageJson: PackageJson};
  };
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
  getPackage(filePath: string): {rootPath: string; packageJson: PackageJson};
  getPackageForModule(absoluteModulePath: string):
    | null
    | undefined
    | {
        packageJson: PackageJson;
        rootPath: string;
        packageRelativePath: string;
      };
  invalidate(filePath: string): void;
}
