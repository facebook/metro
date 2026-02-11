/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

declare function writeFile(
  filePath: string,
  data: string | Buffer | Uint8Array,
  encoding?: string,
): Promise<void>;
export default writeFile;
