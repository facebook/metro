/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<c44d93a454a950171d9456512714303b>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-source-map/src/Consumer/search.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

export declare function greatestLowerBound<T, U>(
  elements: ReadonlyArray<T>,
  target: U,
  comparator: ($$PARAM_0$$: U, $$PARAM_1$$: T) => number,
): null | undefined | number;
