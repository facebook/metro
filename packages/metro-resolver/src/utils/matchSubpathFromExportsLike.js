/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {NormalizedExportsLikeMap, ResolutionContext} from '../types';

import {matchSubpathPattern} from './matchSubpathPattern';
import {reduceExportsLikeMap} from './reduceExportsLikeMap';

/**
 * Get the mapped replacement for the given subpath.
 *
 * Implements modern package resolution behaviour based on the [Package Entry
 * Points spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points).
 */
export function matchSubpathFromExportsLike(
  context: ResolutionContext,
  /**
   * The package-relative subpath (beginning with '.') to match against either
   * an exact subpath key or subpath pattern key in "exports".
   */
  subpath: string,
  exportsLikeMap: NormalizedExportsLikeMap,
  platform: string | null,
  createConfigError: (reason: string) => Error,
): $ReadOnly<{
  target: string | null,
  patternMatch: string | null,
}> {
  const conditionNames = new Set([
    'default',
    context.isESMImport === true ? 'import' : 'require',
    ...context.unstable_conditionNames,
    ...(platform != null
      ? context.unstable_conditionsByPlatform[platform] ?? []
      : []),
  ]);

  const exportsLikeMapAfterConditions = reduceExportsLikeMap(
    exportsLikeMap,
    conditionNames,
    createConfigError,
  );

  let target = exportsLikeMapAfterConditions.get(subpath);
  let patternMatch = null;

  // Attempt to match after expanding any subpath pattern keys
  if (target == null) {
    // Gather keys which are subpath patterns in descending order of specificity
    const expansionKeys = [...exportsLikeMapAfterConditions.keys()]
      .filter(key => key.includes('*'))
      .sort(key => key.split('*')[0].length)
      .reverse();

    for (const key of expansionKeys) {
      const value = exportsLikeMapAfterConditions.get(key);

      // Skip invalid values (must include a single '*' or be `null`)
      if (typeof value === 'string' && value.split('*').length !== 2) {
        break;
      }

      patternMatch = matchSubpathPattern(key, subpath);

      if (patternMatch != null) {
        target = value;
        break;
      }
    }
  }

  return {target: target ?? null, patternMatch};
}
