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

import type {ExportMap, ResolutionContext, SourceFileResolution} from './types';

import path from 'path';
import invariant from 'invariant';
import toPosixPath from './utils/toPosixPath';

/**
 * Resolve a package subpath based on the entry points defined in the package's
 * "exports" field. If there is no match for the given subpath (which may be
 * augmented by resolution of conditional exports for the passed `context`),
 * returns `null`.
 *
 * Implements modern package resolution behaviour based on the [Package Entry
 * Points spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points).
 */
export function resolvePackageTargetFromExports(
  context: ResolutionContext,
  /**
   * The path to the containing npm package directory.
   */
  packageRoot: string,
  /**
   * The unresolved absolute path to the target module. This will be converted
   * to a package-relative subpath for comparison.
   */
  modulePath: string,
  exportsField: ExportMap | string,
  platform: string | null,
): SourceFileResolution | null {
  const packageSubpath = path.relative(packageRoot, modulePath);
  const subpath =
    // Convert to prefixed POSIX path for "exports" lookup
    packageSubpath === '' ? '.' : './' + toPosixPath(packageSubpath);
  const match = matchSubpathFromExports(
    context,
    subpath,
    exportsField,
    platform,
  );

  if (match != null) {
    const filePath = path.join(packageRoot, match);

    if (context.doesFileExist(filePath)) {
      return {type: 'sourceFile', filePath};
    }
    // TODO(T143882479): Throw InvalidPackageConfigurationError (entry point
    // missing) and log as warning in calling context.
  }

  return null;
}

/**
 * Get the mapped replacement for the given subpath.
 *
 * Implements modern package resolution behaviour based on the [Package Entry
 * Points spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points).
 */
function matchSubpathFromExports(
  context: ResolutionContext,
  /**
   * The package-relative subpath (beginning with '.') to match against either
   * an exact subpath key or subpath pattern key in "exports".
   */
  subpath: string,
  exportsField: ExportMap | string,
  platform: string | null,
): ?string {
  const conditionNames = new Set([
    'default',
    ...context.unstable_conditionNames,
    ...(platform != null
      ? context.unstable_conditionsByPlatform[platform] ?? []
      : []),
  ]);

  const exportMap = reduceExportsField(exportsField, conditionNames);

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
  let result: {[subpath: string]: string | null} = {};

  if (typeof exportsField === 'string') {
    result = {'.': exportsField};
  } else {
    const firstLevelKeys = Object.keys(exportsField);
    const subpathKeys = firstLevelKeys.filter(subpathOrCondition =>
      subpathOrCondition.startsWith('.'),
    );

    // TODO(T143882479): Throw InvalidPackageConfigurationError and log as
    // warning in calling context.
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
  }

  const invalidValues = Object.values(result).filter(
    value => value != null && !value.startsWith('./'),
  );

  // TODO(T143882479): Throw InvalidPackageConfigurationError and log as
  // warning in calling context.
  invariant(
    invalidValues.length === 0,
    'One or more mappings for subpaths in "exports" is invalid. All values ' +
      'must begin with "./": ' +
      JSON.stringify(invalidValues),
  );

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
