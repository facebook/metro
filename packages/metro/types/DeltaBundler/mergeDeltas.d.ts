/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<46981e9bc1ef3945b99b147cbdf9ec5d>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/mergeDeltas.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {DeltaBundle} from 'metro-runtime/src/modules/types';

declare function mergeDeltas(
  delta1: DeltaBundle,
  delta2: DeltaBundle,
): DeltaBundle;
export default mergeDeltas;
