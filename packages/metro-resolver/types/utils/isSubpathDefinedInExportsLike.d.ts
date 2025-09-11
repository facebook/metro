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
 * Identifies whether the given subpath is defined in the given "exports"-like
 * mapping. Does not reduce exports conditions (therefore does not identify
 * whether the subpath is mapped to a value).
 */
import type {NormalizedExportsLikeMap} from '../types';

export declare function isSubpathDefinedInExportsLike(
  exportsLikeMap: NormalizedExportsLikeMap,
  subpath: string,
): boolean;
