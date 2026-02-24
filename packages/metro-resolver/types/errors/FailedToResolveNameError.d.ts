/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<a36641315baa7d27d1b9ab17f41dbb35>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/errors/FailedToResolveNameError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

declare class FailedToResolveNameError extends Error {
  dirPaths: ReadonlyArray<string>;
  extraPaths: ReadonlyArray<string>;
  constructor(
    dirPaths: ReadonlyArray<string>,
    extraPaths: ReadonlyArray<string>,
  );
}
export default FailedToResolveNameError;
