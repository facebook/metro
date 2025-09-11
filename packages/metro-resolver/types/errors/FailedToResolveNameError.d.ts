/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

declare class FailedToResolveNameError extends Error {
  dirPaths: ReadonlyArray<string>;
  extraPaths: ReadonlyArray<string>;
  constructor(
    dirPaths: ReadonlyArray<string>,
    extraPaths: ReadonlyArray<string>,
  );
}
export default FailedToResolveNameError;
