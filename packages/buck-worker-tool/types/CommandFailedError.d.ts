/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<b4521777b61531b69738ec9eb98cc8f2>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/buck-worker-tool/src/CommandFailedError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

/**
 * Thrown to indicate the command failed and already output relevant error
 * information on the console.
 */
declare class CommandFailedError extends Error {
  constructor();
}
export default CommandFailedError;
