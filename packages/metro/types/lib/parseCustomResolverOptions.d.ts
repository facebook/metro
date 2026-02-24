/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<e0f212b1e687fef985215d8c152e7c04>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/parseCustomResolverOptions.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {CustomResolverOptions} from 'metro-resolver';

declare function parseCustomResolverOptions(
  searchParams: URLSearchParams,
): CustomResolverOptions;
export default parseCustomResolverOptions;
