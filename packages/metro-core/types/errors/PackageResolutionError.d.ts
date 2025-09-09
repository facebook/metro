/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
