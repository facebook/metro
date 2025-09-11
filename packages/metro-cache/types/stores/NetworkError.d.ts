/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

declare class NetworkError extends Error {
  code: string;
  constructor(message: string, code: string);
}
export default NetworkError;
