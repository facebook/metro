/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<109d7323b70ba3a4582f5868df075ffc>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/errors/InvalidPackageConfigurationError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
