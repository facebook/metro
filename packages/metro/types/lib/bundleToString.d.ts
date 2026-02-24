/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<89a26e72bdd126e3feb0abc9b3186d33>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/bundleToString.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Bundle, BundleMetadata} from 'metro-runtime/src/modules/types';
/**
 * Serializes a bundle into a plain JS bundle.
 */
declare function bundleToString(bundle: Bundle): {
  readonly code: string;
  readonly metadata: BundleMetadata;
};
export default bundleToString;
