/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

import path from 'path';

/**
 * Determine if a file path should be considered an asset file based on the
 * given `assetExts`.
 */
export default function isAssetFile(
  filePath: string,
  assetExts: $ReadOnlySet<string>,
): boolean {
  return assetExts.has(path.extname(filePath).slice(1));
}
