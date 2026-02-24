/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<5d012a93c58cbef8b5b315d70cb4fd5a>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/errors/PackageImportNotResolvedError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

/**
 * Raised when package imports do not define or permit a target subpath in the
 * package for the given import specifier.
 */
declare class PackageImportNotResolvedError extends Error {
  /**
   * Either the import specifier read, or the absolute path of the module being
   * resolved (used when import specifier is externally remapped).
   */
  readonly importSpecifier: string;
  /**
   * The description of the error cause.
   */
  readonly reason: string;
  constructor(opts: Readonly<{importSpecifier: string; reason: string}>);
}
export default PackageImportNotResolvedError;
