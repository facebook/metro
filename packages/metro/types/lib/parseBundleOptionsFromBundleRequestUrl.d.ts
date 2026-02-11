/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {BundleOptions} from '../shared/types';

declare function parseBundleOptionsFromBundleRequestUrl(
  rawNonJscSafeUrlEncodedUrl: string,
  platforms: Set<string>,
): Omit<BundleOptions, keyof {bundleType: string}> & {bundleType: string};
export default parseBundleOptionsFromBundleRequestUrl;
