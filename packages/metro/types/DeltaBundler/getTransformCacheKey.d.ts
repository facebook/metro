/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {TransformerConfig} from './Worker';

declare function getTransformCacheKey(opts: {
  readonly cacheVersion: string;
  readonly projectRoot: string;
  readonly transformerConfig: TransformerConfig;
}): string;
export default getTransformCacheKey;
