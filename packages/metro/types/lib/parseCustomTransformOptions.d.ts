/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<086e5d861160a99775fa58beba59492a>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/parseCustomTransformOptions.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {CustomTransformOptions} from 'metro-transform-worker';

declare function parseCustomTransformOptions(
  searchParams: URLSearchParams,
): CustomTransformOptions;
export default parseCustomTransformOptions;
