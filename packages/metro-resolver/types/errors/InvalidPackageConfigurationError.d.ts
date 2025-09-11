/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/**
 * Raised when a package contains an invalid `package.json` configuration.
 */
declare class InvalidPackageConfigurationError extends Error {
  /**
   * The description of the error cause.
   */
  reason: string;
  /**
   * Absolute path of the package being resolved.
   */
  packagePath: string;
  constructor(opts: Readonly<{reason: string; packagePath: string}>);
}
export default InvalidPackageConfigurationError;
