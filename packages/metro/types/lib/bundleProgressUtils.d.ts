/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<6f0cfa5c118fa3cbe65acee044b8c927>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/bundleProgressUtils.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

/**
 * Calculates a conservative progress ratio for bundle building.
 *
 * Because we know the `totalFileCount` is going to progressively increase
 * starting with 1:
 * - We use Math.max(totalFileCount, 10) to prevent the ratio from raising too
 *   quickly when the total file count is low. (e.g 1/2 5/6)
 * - We use Math.pow(ratio, 2) as a conservative measure of progress.
 * - The ratio is capped at 0.999 to ensure we don't display 100% until done.
 * - If previousRatio is provided, the ratio will not go backwards.
 */
export declare function calculateBundleProgressRatio(
  transformedFileCount: number,
  totalFileCount: number,
  previousRatio?: number,
): number;
