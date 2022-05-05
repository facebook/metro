/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {ConfigT} from 'metro-config/src/configTypes.flow';

import MetroFileMap from 'metro-file-map';

const ci = require('ci-info');
const path = require('path');

const JEST_HASTE_MAP_CACHE_BREAKER = 5;

function getIgnorePattern(config: ConfigT): RegExp {
  // For now we support both options
  const {blockList, blacklistRE} = config.resolver;
  const ignorePattern = blacklistRE || blockList;

  // If neither option has been set, use default pattern
  if (!ignorePattern) {
    return / ^/;
  }

  const combine = regexes =>
    new RegExp(
      regexes
        .map(regex => '(' + regex.source.replace(/\//g, path.sep) + ')')
        .join('|'),
    );

  // If ignorePattern is an array, merge it into one
  if (Array.isArray(ignorePattern)) {
    return combine(ignorePattern);
  }

  return ignorePattern;
}

function createHasteMap(
  config: ConfigT,
  options?: $ReadOnly<{
    extractDependencies?: boolean,
    watch?: boolean,
    throwOnModuleCollision?: boolean,
    name?: string,
  }>,
): MetroFileMap {
  const dependencyExtractor =
    options?.extractDependencies === false
      ? null
      : config.resolver.dependencyExtractor;
  const computeDependencies = dependencyExtractor != null;

  return MetroFileMap.create({
    cacheDirectory: config.hasteMapCacheDirectory,
    computeDependencies,
    computeSha1: true,
    dependencyExtractor: config.resolver.dependencyExtractor,
    extensions: config.resolver.sourceExts.concat(config.resolver.assetExts),
    forceNodeFilesystemAPI: !config.resolver.useWatchman,
    hasteImplModulePath: config.resolver.hasteImplModulePath,
    hasteMapModulePath: config.resolver.unstable_hasteMapModulePath,
    ignorePattern: getIgnorePattern(config),
    maxWorkers: config.maxWorkers,
    mocksPattern: '',
    name: `${options?.name ?? 'metro'}-${JEST_HASTE_MAP_CACHE_BREAKER}`,
    platforms: config.resolver.platforms,
    retainAllFiles: true,
    resetCache: config.resetCache,
    rootDir: config.projectRoot,
    roots: config.watchFolders,
    throwOnModuleCollision: options?.throwOnModuleCollision ?? true,
    useWatchman: config.resolver.useWatchman,
    watch: options?.watch == null ? !ci.isCI : options.watch,
  });
}

module.exports = createHasteMap;
