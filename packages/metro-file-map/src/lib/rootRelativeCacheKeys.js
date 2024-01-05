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

import type {BuildParameters} from '../flow-types';

import normalizePathSeparatorsToPosix from './normalizePathSeparatorsToPosix';
import {RootPathUtils} from './RootPathUtils';
import {createHash} from 'crypto';

function moduleCacheKey(modulePath: ?string) {
  if (modulePath == null) {
    return null;
  }
  // $FlowFixMe[unsupported-syntax] - Dynamic require
  const moduleExports = require(modulePath);
  if (typeof moduleExports?.getCacheKey !== 'function') {
    console.warn(
      `metro-file-map: Expected \`${modulePath}\` to export ` +
        '`getCacheKey: () => string`',
    );
    return null;
  }
  return moduleExports.getCacheKey();
}

export default function rootRelativeCacheKeys(
  buildParameters: BuildParameters,
): {
  rootDirHash: string,
  relativeConfigHash: string,
} {
  const {rootDir, ...otherParameters} = buildParameters;
  const rootDirHash = createHash('md5')
    .update(normalizePathSeparatorsToPosix(rootDir))
    .digest('hex');
  const pathUtils = new RootPathUtils(rootDir);

  const cacheComponents = Object.keys(otherParameters)
    .sort()
    .map(key => {
      switch (key) {
        case 'roots':
          return buildParameters[key].map(root =>
            normalizePathSeparatorsToPosix(pathUtils.absoluteToNormal(root)),
          );
        case 'cacheBreaker':
        case 'extensions':
        case 'computeDependencies':
        case 'computeSha1':
        case 'enableHastePackages':
        case 'enableSymlinks':
        case 'forceNodeFilesystemAPI':
        case 'platforms':
        case 'retainAllFiles':
        case 'skipPackageJson':
          return buildParameters[key] ?? null;
        case 'mocksPattern':
          return buildParameters[key]?.toString() ?? null;
        case 'ignorePattern':
          return buildParameters[key].toString();
        case 'hasteImplModulePath':
        case 'dependencyExtractor':
          return moduleCacheKey(buildParameters[key]);
        default:
          (key: empty);
          throw new Error('Unrecognised key in build parameters: ' + key);
      }
    });

  // JSON.stringify is stable here because we only deal in (nested) arrays of
  // primitives. Use a different approach if this is expanded to include
  // objects/Sets/Maps, etc.
  const relativeConfigHash = createHash('md5')
    .update(JSON.stringify(cacheComponents))
    .digest('hex');

  return {
    rootDirHash,
    relativeConfigHash,
  };
}
