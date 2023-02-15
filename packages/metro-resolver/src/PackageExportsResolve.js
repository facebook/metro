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
import InvalidPackageConfigurationError from './errors/InvalidPackageConfigurationError';
import toPosixPath from './utils/toPosixPath';

/**
 * Resolve a package subpath based on the entry points defined in the package's
 * "exports" field. If there is no match for the given subpath (which may be
 * augmented by resolution of conditional exports for the passed `context`),
 * returns `null`.
 *
 * Implements modern package resolution behaviour based on the [Package Entry
 * Points spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points).
 *
 * @throws {InvalidPackageConfigurationError} Raised if configuration specified
 *   by `exportsField` is invalid.
 */
export function resolvePackageTargetFromExports(
  context: ResolutionContext,
  /**
   * The path to the containing npm package directory.
   */
  packagePath: string,
  /**
   * The unresolved absolute path to the target module. This will be converted
   * to a package-relative subpath for comparison.
   */
  modulePath: string,
  exportsField: ExportMap | string,
  platform: string | null,
): SourceFileResolution | null {
  const raiseConfigError = (reason: string) => {
    throw new InvalidPackageConfigurationError({
      reason,
      modulePath,
      packagePath,
    });
  };

  const packageSubpath = path.relative(packagePath, modulePath);
  const subpath =
    // Convert to prefixed POSIX path for "exports" lookup
    packageSubpath === '' ? '.' : './' + toPosixPath(packageSubpath);
  const match = matchSubpathFromExports(
    context,
    subpath,
    exportsField,
    platform,
    raiseConfigError,
  );

  if (match != null) {
    const filePath = path.join(packagePath, match);

    if (context.doesFileExist(filePath)) {
      return {type: 'sourceFile', filePath};
    }

    raiseConfigError(
      `The resolution for "${modulePath}" defined in "exports" is ${filePath}, ` +
        'however this file does not exist.',
    );
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
  raiseConfigError: (reason: string) => void,
): ?string {
  const conditionNames = new Set([
    'default',
    ...context.unstable_conditionNames,
    ...(platform != null
      ? context.unstable_conditionsByPlatform[platform] ?? []
      : []),
  ]);

  const exportMap = reduceExportsField(
    exportsField,
    conditionNames,
    raiseConfigError,
  );

  let match = exportMap[subpath];

  // Attempt to match after expanding any subpath pattern keys
  if (match == null) {
    // Gather keys which are subpath patterns in descending order of specificity
    const expansionKeys = Object.keys(exportMap)
      .filter(key => key.includes('*'))
      .sort(key => key.split('*')[0].length)
      .reverse();

    for (const key of expansionKeys) {
      const value = exportMap[key];

      // Skip invalid values (must include a single '*' or be `null`)
      if (typeof value === 'string' && value.split('*').length !== 2) {
        break;
      }

      const patternMatch = matchSubpathPattern(key, subpath);

      if (patternMatch != null) {
        match = value == null ? null : value.replace('*', patternMatch);
        break;
      }
    }
  }

  return match;
}

type FlattenedExportMap = $ReadOnly<{[subpath: string]: string | null}>;

/**
 * Reduce an "exports"-like field to a flat subpath mapping after resolving
 * shorthand syntax and conditional exports.
 */
function reduceExportsField(
  exportsField: ExportMap | string,
  conditionNames: $ReadOnlySet<string>,
  raiseConfigError: (reason: string) => void,
): FlattenedExportMap {
  let result: {[subpath: string]: string | null} = {};

  if (typeof exportsField === 'string') {
    result = {'.': exportsField};
  } else {
    const firstLevelKeys = Object.keys(exportsField);
    const subpathKeys = firstLevelKeys.filter(subpathOrCondition =>
      subpathOrCondition.startsWith('.'),
    );

    if (
      subpathKeys.length !== 0 &&
      subpathKeys.length !== firstLevelKeys.length
    ) {
      raiseConfigError(
        'The "exports" field cannot have keys which are both subpaths and ' +
          'condition names at the same level',
      );
    }

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

  if (invalidValues.length) {
    raiseConfigError(
      'One or more mappings for subpaths defined in "exports" are invalid. ' +
        'All values must begin with "./".',
    );
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

/**
 * If a subpath pattern expands to the passed subpath, return the subpath match
 * (value to substitute for '*'). Otherwise, return `null`.
 *
 * See https://nodejs.org/docs/latest-v19.x/api/packages.html#subpath-patterns.
 */
function matchSubpathPattern(
  subpathPattern: string,
  subpath: string,
): string | null {
  const [patternBase, patternTrailer] = subpathPattern.split('*');

  if (subpath.startsWith(patternBase) && subpath.endsWith(patternTrailer)) {
    return subpath.substring(
      patternBase.length,
      subpath.length - patternTrailer.length,
    );
  }

  return null;
}
