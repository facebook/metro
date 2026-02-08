/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

declare function meta(
  code: Buffer | string,
  encoding?: 'ascii' | 'utf16le' | 'utf8',
): Buffer;
export default meta;
