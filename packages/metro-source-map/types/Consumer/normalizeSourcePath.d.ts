/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

declare function normalizeSourcePath(
  sourceInput: string,
  map: {readonly sourceRoot?: null | undefined | string},
): string;
export default normalizeSourcePath;
