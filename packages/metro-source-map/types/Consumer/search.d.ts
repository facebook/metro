/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

export declare function greatestLowerBound<T, U>(
  elements: ReadonlyArray<T>,
  target: U,
  comparator: ($$PARAM_0$$: U, $$PARAM_1$$: T) => number,
): null | undefined | number;
