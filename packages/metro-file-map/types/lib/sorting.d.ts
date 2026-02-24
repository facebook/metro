/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<8805bc71542c6b43e940f8c5761ff187>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/lib/sorting.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

export declare function compareStrings(
  a: null | string,
  b: null | string,
): number;
export declare function chainComparators<T>(
  ...comparators: Array<(a: T, b: T) => number>
): (a: T, b: T) => number;
