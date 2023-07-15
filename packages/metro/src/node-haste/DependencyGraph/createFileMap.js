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

import type {ConfigT} from 'metro-config/src/configTypes.flow';

import MetroFileMap, {DiskCacheManager} from 'metro-file-map';

const ci = require('ci-info');

function getIgnorePattern(config: ConfigT): RegExp {
  // For now we support both options
  const {blockList, blacklistRE} = config.resolver;
  const ignorePattern = blacklistRE || blockList;

  // If neither option has been set, use default pattern
  if (!ignorePattern) {
    return / ^/;
  }

  const combine = (regexes: Array<RegExp>) =>
    new RegExp(
      regexes
        .map((regex, index) => {
          if (regex.flags !== regexes[0].flags) {
            throw new Error(
              'Cannot combine blockList patterns, because they have different flags:\n' +
                ' - Pattern 0: ' +
                regexes[0].toString() +
                '\n' +
                ` - Pattern ${index}: ` +
                regexes[index].toString(),
            );
          }
          return '(' + regex.source + ')';
        })
        .join('|'),
      regexes[0]?.flags ?? '',
    );

  // If ignorePattern is an array, merge it into one
  if (Array.isArray(ignorePattern)) {
    return combine(ignorePattern);
  }

  return ignorePattern;
}

function createFileMap(
  config: ConfigT,
  options?: $ReadOnly<{
    extractDependencies?: boolean,
    watch?: boolean,
    throwOnModuleCollision?: boolean,
    cacheFilePrefix?: string,
  }>,
): MetroFileMap {
  const dependencyExtractor =
    options?.extractDependencies === false
      ? null
      : config.resolver.dependencyExtractor;
  const computeDependencies = dependencyExtractor != null;

  return MetroFileMap.create({
    cacheManagerFactory:
      config?.unstable_fileMapCacheManagerFactory ??
      (buildParameters =>
        new DiskCacheManager({
          buildParameters,
          cacheDirectory:
            config.fileMapCacheDirectory ?? config.hasteMapCacheDirectory,
          cacheFilePrefix: options?.cacheFilePrefix,
        })),
    perfLoggerFactory: config.unstable_perfLoggerFactory,
    computeDependencies,
    computeSha1: true,
    dependencyExtractor: config.resolver.dependencyExtractor,
    enableSymlinks: config.resolver.unstable_enableSymlinks,
    extensions: Array.from(
      new Set([
        ...config.resolver.sourceExts,
        ...config.resolver.assetExts,
        ...config.watcher.additionalExts,
      ]),
    ),
    forceNodeFilesystemAPI: !config.resolver.useWatchman,
    hasteImplModulePath: config.resolver.hasteImplModulePath,
    healthCheck: config.watcher.healthCheck,
    ignorePattern: getIgnorePattern(config),
    maxWorkers: config.maxWorkers,
    mocksPattern: '',
    platforms: [...config.resolver.platforms, MetroFileMap.H.NATIVE_PLATFORM],
    retainAllFiles: true,
    resetCache: config.resetCache,
    rootDir: config.projectRoot,
    roots: config.watchFolders,
    throwOnModuleCollision: options?.throwOnModuleCollision ?? true,
    useWatchman: config.resolver.useWatchman,
    watch: options?.watch == null ? !ci.isCI : options.watch,
    watchmanDeferStates: config.watcher.watchman.deferStates,
  });
}

module.exports = createFileMap;
