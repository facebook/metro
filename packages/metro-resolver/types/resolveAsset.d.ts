/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {AssetResolution, ResolutionContext} from './types';
/**
 * Resolve a file path as an asset. Returns the set of files found after
 * expanding asset resolutions (e.g. `icon@2x.png`). Users may override this
 * behaviour via `context.resolveAsset`.
 */
declare function resolveAsset(
  context: ResolutionContext,
  filePath: string,
): AssetResolution | null;
export default resolveAsset;
