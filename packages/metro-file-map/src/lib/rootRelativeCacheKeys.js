/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {BuildParameters} from '../flow-types';

import * as fastPath from './fast_path';
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
  const rootDirHash = createHash('md5')
    .update(buildParameters.rootDir)
    .digest('hex');

  // JSON.stringify is stable here because we only deal in (nested) arrays of
  // primitives. Use a different approach if this is expanded to include
  // objects/Sets/Maps, etc.
  const serializedConfig = JSON.stringify([
    buildParameters.roots.map(root =>
      fastPath.relative(buildParameters.rootDir, root),
    ),
    buildParameters.extensions,
    buildParameters.platforms,
    buildParameters.computeSha1,
    buildParameters.mocksPattern?.toString() ?? null,
    buildParameters.ignorePattern.toString(),
    moduleCacheKey(buildParameters.hasteImplModulePath),
    moduleCacheKey(buildParameters.dependencyExtractor),
    buildParameters.computeDependencies,
    buildParameters.cacheBreaker,
  ]);
  const relativeConfigHash = createHash('md5')
    .update(serializedConfig)
    .digest('hex');

  return {
    rootDirHash,
    relativeConfigHash,
  };
}
