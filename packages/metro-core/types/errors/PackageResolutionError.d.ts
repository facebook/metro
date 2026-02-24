/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<354fde3c81b3278d772c9279758d6b13>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-core/src/errors/PackageResolutionError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {InvalidPackageError} from 'metro-resolver';

declare class PackageResolutionError extends Error {
  originModulePath: string;
  packageError: InvalidPackageError;
  targetModuleName: string;
  constructor(opts: {
    readonly originModulePath: string;
    readonly packageError: InvalidPackageError;
    readonly targetModuleName: string;
  });
}
export default PackageResolutionError;
