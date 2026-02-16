/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/**
 * Thrown to indicate the command failed and already output relevant error
 * information on the console.
 */
declare class CommandFailedError extends Error {
  constructor();
}
export default CommandFailedError;
