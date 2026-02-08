/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

declare function coerceKeyValueArray(keyValueArray: ReadonlyArray<string>): {
  [key: string]: string;
};
export default coerceKeyValueArray;
