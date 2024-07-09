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

import type {ExportMap, FileResolution, ResolutionContext} from './types';

import InvalidPackageConfigurationError from './errors/InvalidPackageConfigurationError';
import PackageImportNotResolvedError from './errors/PackageImportNotResolvedError';
import {
  matchSubpathFromExports,
  matchSubpathPattern,
} from './PackageExportsResolve';
import resolveAsset from './resolveAsset';
import isAssetFile from './utils/isAssetFile';
import path from 'path';

export function resolvePackageTargetFromImports(
  context: ResolutionContext,
  /**
   * The absolute path to the package.json
   */
  packagePath: string,
  importSpecifier: string,
  importMap: ExportMap,
  platform: string | null,
): FileResolution {
  const createConfigError = (reason: string) => {
    return new InvalidPackageConfigurationError({
      reason,
      packagePath,
    });
  };

  const firstLevelKeys = Object.keys(importMap);
  const keysWithoutPrefix = firstLevelKeys.filter(key => !key.startsWith('#'));
  if (keysWithoutPrefix.length !== 0) {
    throw createConfigError(
      'The "imports" field cannot have keys which do not start with #',
    );
  }

  if (!isSubpathDefinedImports(importMap, importSpecifier)) {
    throw new PackageImportNotResolvedError({
      importSpecifier,
      reason: `"${importSpecifier}" could not be matched using "imports" of ${packagePath}`,
    });
  }

  const {target, patternMatch} = matchSubpathFromExports(
    context,
    importSpecifier,
    importMap,
    platform,
    createConfigError,
  );

  if (target != null) {
    const invalidSegmentInTarget = findInvalidPathSegment(target.slice(2));

    if (invalidSegmentInTarget != null) {
      throw createConfigError(
        `The resolved path for "${importSpecifier}" defined in "imports" is "${target}", ` +
          `however this value is an invalid because it includes "${invalidSegmentInTarget}".`,
      );
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

    if (context.unstable_getRealPath != null) {
      const maybeRealPath = context.unstable_getRealPath(filePath);
      if (maybeRealPath != null) {
        return {
          type: 'sourceFile',
          filePath: maybeRealPath,
        };
      }
    } else if (context.doesFileExist(filePath)) {
      return {
        type: 'sourceFile',
        filePath,
      };
    }

    throw createConfigError(
      `The resolved path for "${importSpecifier}" defined in "imports" is ${filePath}, ` +
        'however this file does not exist.',
    );
  }

  throw new PackageImportNotResolvedError({
    importSpecifier,
    reason:
      `"${importSpecifier}" which matches a subpath "imports" in ${packagePath}` +
      `however no match was resolved for this request (platform = ${platform ?? 'null'}).`,
  });
}

function isSubpathDefinedImports(
  importMap: ExportMap,
  importSpecifier: string,
): boolean {
  if (importSpecifier in importMap) {
    /**
     * if the specifier directly matches a subpath in the map
     * (in case where the subpath has no patterns)
     */
    return true;
  }

  for (const key in importMap) {
    /**
     * if and only if there is exactly one * in the subpath key do
     * we treat this subpath as a subpath pattern
     */
    const isSubpathPattern = key.split('*').length === 2;
    if (isSubpathPattern && matchSubpathPattern(key, importSpecifier) != null) {
      // if there is a matching subpath pattern then the specifier is in the map
      return true;
    }
  }

  return false;
}

function findInvalidPathSegment(path: string): ?string {
  const segments = path.split(/[\\/]/);
  return segments.find(segment =>
    ['', '.', '..', 'node_modules'].includes(segment),
  );
}
