/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<f9f99f4d6c93fb36455e75fa72336e11>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/errors/PackagePathNotExportedError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

/**
 * Raised when package exports do not define or permit a target subpath in the
 * package for the given module.
 */
declare class PackagePathNotExportedError extends Error {}
export default PackagePathNotExportedError;
