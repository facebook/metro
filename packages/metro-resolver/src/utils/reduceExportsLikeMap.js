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

/**
 * Reduce an "exports"-like mapping to a flat subpath mapping after resolving
 * conditional exports.
 */
import type {
  ExportsLikeMap,
  FlattenedExportMap,
  NormalizedExportsLikeMap,
} from '../types';

const NO_MATCH: symbol = Symbol('no-match');

export function reduceExportsLikeMap(
  exportsLikeMap: NormalizedExportsLikeMap,
  conditionNames: ReadonlySet<string>,
  createConfigError: (reason: string) => Error,
): FlattenedExportMap {
  const result = new Map<string, string | null>();

  for (const [subpath, value] of exportsLikeMap) {
    const subpathValue = reduceConditionalExport(
      value,
      conditionNames,
      createConfigError,
    );

    // An exact key takes precedence over subpath patterns even when no
    // condition matches, so retain it as an explicit null.
    result.set(subpath, typeof subpathValue === 'string' ? subpathValue : null);
  }

  for (const value of result.values()) {
    if (value != null && !value.startsWith('./')) {
      throw createConfigError(
        'One or more mappings for subpaths defined in "exports" are invalid. ' +
          'All values must begin with "./".',
      );
    }
  }

  return result;
}

/**
 * Reduce an "exports"-like subpath value after asserting the passed
 * `conditionNames` in any nested conditions.
 *
 * Returns `NO_MATCH` in the case that none of the asserted `conditionNames`
 * are matched.
 *
 * See https://nodejs.org/docs/latest-v19.x/api/packages.html#conditional-exports.
 */
function reduceConditionalExport(
  subpathValue: Values<ExportsLikeMap>,
  conditionNames: ReadonlySet<string>,
  createConfigError: (reason: string) => Error,
): string | null | symbol {
  if (subpathValue == null || typeof subpathValue === 'string') {
    return subpathValue;
  }
  if (typeof subpathValue !== 'object') {
    throw createConfigError(
      'A conditional target must be a string, an object, or null.',
    );
  }
  // Legacy arrays are normalized earlier; nested arrays remain unsupported.
  if (Array.isArray(subpathValue)) {
    return null;
  }

  for (const conditionName in subpathValue) {
    if (conditionNames.has(conditionName)) {
      const resolved = reduceConditionalExport(
        subpathValue[conditionName],
        conditionNames,
        createConfigError,
      );
      // Null excludes this entry; only an unmatched condition falls through.
      if (resolved !== NO_MATCH) {
        return resolved;
      }
    }
  }

  return NO_MATCH;
}
