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

import type {ExportMap, FileResolution, ResolutionContext} from './types';

import path from 'path';
import InvalidModuleSpecifierError from './errors/InvalidModuleSpecifierError';
import InvalidPackageConfigurationError from './errors/InvalidPackageConfigurationError';
import PackagePathNotExportedError from './errors/PackagePathNotExportedError';
import resolveAsset from './resolveAsset';
import isAssetFile from './utils/isAssetFile';
import toPosixPath from './utils/toPosixPath';

/**
 * Resolve a package subpath based on the entry points defined in the package's
 * "exports" field. If there is no match for the given subpath (which may be
 * augmented by resolution of conditional exports for the passed `context`),
 * throws a `PackagePathNotExportedError`.
 *
 * Implements modern package resolution behaviour based on the [Package Entry
 * Points spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points).
 *
 * @throws {InvalidPackageConfigurationError} Raised if configuration specified
 *   by `exportsField` is invalid.
 * @throws {InvalidModuleSpecifierError} Raised if the resolved module specifier
 *   is invalid.
 * @throws {PackagePathNotExportedError} Raised when the requested subpath is
 *   not exported.
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
): FileResolution {
  const raiseConfigError = (reason: string) => {
    throw new InvalidPackageConfigurationError({
      reason,
      packagePath,
    });
  };

  const subpath = getExportsSubpath(packagePath, modulePath);
  const exportMap = normalizeExportsField(exportsField, raiseConfigError);

  if (!isSubpathDefinedInExports(exportMap, subpath)) {
    throw new PackagePathNotExportedError(
      `Attempted to import the module "${modulePath}" which is not listed ` +
        `in the "exports" of "${packagePath}".`,
    );
  }

  const {target, patternMatch} = matchSubpathFromExports(
    context,
    subpath,
    exportMap,
    platform,
    raiseConfigError,
  );

  if (target != null) {
    const invalidSegmentInTarget = findInvalidPathSegment(target.slice(2));

    if (invalidSegmentInTarget != null) {
      raiseConfigError(
        `The target for "${subpath}" defined in "exports" is "${target}", ` +
          'however this value is an invalid subpath or subpath pattern ' +
          `because it includes "${invalidSegmentInTarget}".`,
      );
    }

    if (patternMatch != null && findInvalidPathSegment(patternMatch) != null) {
      throw new InvalidModuleSpecifierError({
        importSpecifier: modulePath,
        reason:
          `The target for "${subpath}" defined in "exports" is "${target}", ` +
          'however this expands to an invalid subpath because the pattern ' +
          `match "${patternMatch}" is invalid.`,
      });
    }

    const filePath = path.join(
      packagePath,
      patternMatch != null ? target.replace('*', patternMatch) : target,
    );

    if (isAssetFile(filePath, context.assetExts)) {
      const assetResult = resolveAsset(context, filePath);

      if (assetResult != null) {
        return assetResult;
      }
    }

    if (context.doesFileExist(filePath)) {
      return {type: 'sourceFile', filePath};
    }

    raiseConfigError(
      `The resolution for "${modulePath}" defined in "exports" is ${filePath}, ` +
        'however this file does not exist.',
    );
  }

  throw new PackagePathNotExportedError(
    `Attempted to import the module "${modulePath}" which is listed in the ` +
      `"exports" of "${packagePath}, however no match was resolved for this` +
      `request (platform = ${platform ?? 'null'}).`,
  );
}

/**
 * Convert a module path to the package-relative subpath key to attempt for
 * "exports" field lookup.
 */
function getExportsSubpath(packagePath: string, modulePath: string): string {
  const packageSubpath = path.relative(packagePath, modulePath);

  return packageSubpath === '' ? '.' : './' + toPosixPath(packageSubpath);
}

/**
 * Normalise an "exports"-like field by parsing string shorthand and conditions
 * shorthand at root.
 *
 * See https://nodejs.org/docs/latest-v19.x/api/packages.html#exports-sugar.
 */
function normalizeExportsField(
  exportsField: ExportMap | string,
  raiseConfigError: (reason: string) => void,
): ExportMap {
  if (typeof exportsField === 'string') {
    return {'.': exportsField};
  }

  const firstLevelKeys = Object.keys(exportsField);
  const subpathKeys = firstLevelKeys.filter(subpathOrCondition =>
    subpathOrCondition.startsWith('.'),
  );

  if (subpathKeys.length === firstLevelKeys.length) {
    return exportsField;
  }

  if (subpathKeys.length !== 0) {
    raiseConfigError(
      'The "exports" field cannot have keys which are both subpaths and ' +
        'condition names at the same level.',
    );
  }

  return {'.': exportsField};
}

/**
 * Identifies whether the given subpath is defined in the given "exports"-like
 * mapping. Does not reduce exports conditions (therefore does not identify
 * whether the subpath is mapped to a value).
 */
export function isSubpathDefinedInExports(
  exportMap: ExportMap,
  subpath: string,
): boolean {
  if (subpath in exportMap) {
    return true;
  }

  // Attempt to match after expanding any subpath pattern keys
  for (const key in exportMap) {
    if (
      key.split('*').length === 2 &&
      matchSubpathPattern(key, subpath) != null
    ) {
      return true;
    }
  }

  return false;
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
  exportMap: ExportMap,
  platform: string | null,
  raiseConfigError: (reason: string) => void,
): $ReadOnly<{
  target: string | null,
  patternMatch: string | null,
}> {
  const conditionNames = new Set([
    'default',
    ...context.unstable_conditionNames,
    ...(platform != null
      ? context.unstable_conditionsByPlatform[platform] ?? []
      : []),
  ]);

  const exportMapAfterConditions = reduceExportMap(
    exportMap,
    conditionNames,
    raiseConfigError,
  );

  let target = exportMapAfterConditions[subpath];
  let patternMatch = null;

  // Attempt to match after expanding any subpath pattern keys
  if (target == null) {
    // Gather keys which are subpath patterns in descending order of specificity
    const expansionKeys = Object.keys(exportMapAfterConditions)
      .filter(key => key.includes('*'))
      .sort(key => key.split('*')[0].length)
      .reverse();

    for (const key of expansionKeys) {
      const value = exportMapAfterConditions[key];

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

  return {target, patternMatch};
}

type FlattenedExportMap = $ReadOnly<{[subpath: string]: string | null}>;

/**
 * Reduce an "exports"-like mapping to a flat subpath mapping after resolving
 * conditional exports.
 */
function reduceExportMap(
  exportMap: ExportMap,
  conditionNames: $ReadOnlySet<string>,
  raiseConfigError: (reason: string) => void,
): FlattenedExportMap {
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

function findInvalidPathSegment(subpath: string): ?string {
  for (const segment of subpath.split(/[\\/]/)) {
    if (
      segment === '' ||
      segment === '.' ||
      segment === '..' ||
      segment === 'node_modules'
    ) {
      return segment;
    }
  }

  return null;
}
