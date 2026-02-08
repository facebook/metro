/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {Bundle, BundleMetadata} from 'metro-runtime/src/modules/types';
/**
 * Serializes a bundle into a plain JS bundle.
 */
declare function bundleToString(bundle: Bundle): {
  readonly code: string;
  readonly metadata: BundleMetadata;
};
export default bundleToString;
