/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<ee7db612dfb499aad9673000da2af870>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/resolveAsset.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {AssetResolution, ResolutionContext} from './types';
/**
 * Resolve a file path as an asset. Returns the set of files found after
 * expanding asset resolutions (e.g. `icon@2x.png`). Users may override this
 * behaviour via `context.resolveAsset`.
 */
declare function resolveAsset(
  context: ResolutionContext,
  filePath: string,
): AssetResolution | null;
export default resolveAsset;
