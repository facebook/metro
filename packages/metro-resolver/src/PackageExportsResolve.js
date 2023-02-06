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

import type {ExportMap, PackageInfo, ResolutionContext} from './types';

import invariant from 'invariant';

/**
 * Resolve the main entry point subpath for a package.
 *
 * Implements modern package resolution behaviour based on the [Package Entry
 * Points spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points).
 */
export function getPackageEntryPointFromExports(
  context: ResolutionContext,
  packageInfo: PackageInfo,
  platform: string | null,
): ?string {
  return matchSubpathFromExports('.', context, packageInfo, platform);
}

/**
 * Get the mapped replacement for the given subpath.
 *
 * Implements modern package resolution behaviour based on the [Package Entry
 * Points spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points).
 */
export function matchSubpathFromExports(
  /**
   * The package-relative subpath (beginning with '.') to match against either
   * an exact subpath key or subpath pattern key in "exports".
   */
  subpath: string,
  context: ResolutionContext,
  {packageJson}: PackageInfo,
  platform: string | null,
): ?string {
  const {exports: exportsField} = packageJson;

  if (exportsField == null) {
    return null;
  }

  const conditionNames = new Set([
    'default',
    ...context.unstable_conditionNames,
    ...(platform != null
      ? context.unstable_conditionsByPlatform[platform] ?? []
      : []),
  ]);

  let exportMap: FlattenedExportMap;

  try {
    exportMap = reduceExportsField(exportsField, conditionNames);
  } catch (e) {
    // TODO(T143882479): Log a warning if the "exports" field cannot be parsed
    // NOTE: Under strict mode, this should throw an InvalidPackageConfigurationError
    return null;
  }

  return exportMap[subpath];
}

type FlattenedExportMap = $ReadOnly<{[subpath: string]: string | null}>;

/**
 * Reduce an "exports"-like field to a flat subpath mapping after resolving
 * shorthand syntax and conditional exports.
 *
 * @throws Will throw invariant violation if structure or configuration
 *   specified by `exportsField` is invalid.
 */
function reduceExportsField(
  exportsField: ExportMap | string,
  conditionNames: $ReadOnlySet<string>,
): FlattenedExportMap {
  if (typeof exportsField === 'string') {
    return {'.': exportsField};
  }

  const firstLevelKeys = Object.keys(exportsField);
  const subpathKeys = firstLevelKeys.filter(subpathOrCondition =>
    subpathOrCondition.startsWith('.'),
  );

  invariant(
    subpathKeys.length === 0 || subpathKeys.length === firstLevelKeys.length,
    '"exports" object cannot have keys mapping both subpaths and conditions ' +
      'at the same level',
  );

  let exportMap = exportsField;

  // Normalise conditions shorthand at root
  if (subpathKeys.length === 0) {
    exportMap = {'.': exportsField};
  }

  const result: {[subpath: string]: string | null} = {};

  for (const subpath in exportMap) {
    const subpathValue = reduceConditionalExport(
      exportMap[subpath],
      conditionNames,
    );

    // If a subpath has no resolution for the passed `conditionNames`, do not
    // include it in the result. (This includes only explicit `null` values,
    // which may conditionally hide higher-specificity subpath patterns.)
    if (subpathValue !== 'no-match') {
      result[subpath] = subpathValue;
    }
  }

  return result;
}

/**
 * Reduce an "exports"-like subpath value after asserting the passed
 * `conditionNames` in any nested conditions.
 *
 * Returns `'no-match'` in the case that none of the asserted `conditionNames`
 * are matched.
 *
 * See https://nodejs.org/docs/latest-v19.x/api/packages.html#conditional-exports.
 */
function reduceConditionalExport(
  subpathValue: ExportMap | string | null,
  conditionNames: $ReadOnlySet<string>,
): string | null | 'no-match' {
  let reducedValue = subpathValue;

  while (reducedValue != null && typeof reducedValue !== 'string') {
    let match: typeof subpathValue | 'no-match' = 'no-match';

    for (const conditionName in reducedValue) {
      if (conditionNames.has(conditionName)) {
        match = reducedValue[conditionName];
        break;
      }
    }

    reducedValue = match;
  }

  return reducedValue;
}
