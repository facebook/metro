/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<cf1e935fe7a5b1c8573b53b1c1921e70>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/splitBundleOptions.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {BundleOptions, SplitBundleOptions} from '../shared/types';
/**
 * Splits a BundleOptions object into smaller, more manageable parts.
 */
declare function splitBundleOptions(options: BundleOptions): SplitBundleOptions;
export default splitBundleOptions;
