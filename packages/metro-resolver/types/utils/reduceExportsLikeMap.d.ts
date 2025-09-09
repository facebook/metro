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
 * Reduce an "exports"-like mapping to a flat subpath mapping after resolving
 * conditional exports.
 */
import type {FlattenedExportMap, NormalizedExportsLikeMap} from '../types';

export declare function reduceExportsLikeMap(
  exportsLikeMap: NormalizedExportsLikeMap,
  conditionNames: ReadonlySet<string>,
  createConfigError: (reason: string) => Error,
): FlattenedExportMap;
