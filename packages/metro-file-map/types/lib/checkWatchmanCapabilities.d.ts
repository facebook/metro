/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<f72d8f0c4d8f513383584a02f36795ef>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/lib/checkWatchmanCapabilities.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

declare function checkWatchmanCapabilities(
  requiredCapabilities: ReadonlyArray<string>,
): Promise<{version: string}>;
export default checkWatchmanCapabilities;
