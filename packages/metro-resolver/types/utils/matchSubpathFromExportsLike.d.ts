/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {NormalizedExportsLikeMap, ResolutionContext} from '../types';
/**
 * Get the mapped replacement for the given subpath.
 *
 * Implements modern package resolution behaviour based on the [Package Entry
 * Points spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points).
 */
export declare function matchSubpathFromExportsLike(
  context: ResolutionContext,
  subpath: string,
  exportsLikeMap: NormalizedExportsLikeMap,
  platform: string | null,
  createConfigError: (reason: string) => Error,
): Readonly<{target: string | null; patternMatch: string | null}>;
