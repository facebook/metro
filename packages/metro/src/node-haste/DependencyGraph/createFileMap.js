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

import type {ConfigT} from 'metro-config';
import type {HasteMap} from 'metro-file-map';

import ci from 'ci-info';
import MetroFileMap, {DiskCacheManager, HastePlugin} from 'metro-file-map';

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

export default function createFileMap(
  config: ConfigT,
  options?: Readonly<{
    extractDependencies?: boolean,
    watch?: boolean,
    throwOnModuleCollision?: boolean,
    cacheFilePrefix?: string,
  }>,
): {fileMap: MetroFileMap, hasteMap: HasteMap} {
  const dependencyExtractor =
    options?.extractDependencies === false
      ? null
      : config.resolver.dependencyExtractor;
  const computeDependencies = dependencyExtractor != null;

  const watch = options?.watch == null ? !ci.isCI : options.watch;
  const {enabled: autoSaveEnabled, ...autoSaveOpts} =
    config.watcher.unstable_autoSaveCache ?? {};
  const autoSave = watch && autoSaveEnabled ? autoSaveOpts : false;

  const hasteMap = new HastePlugin({
    platforms: new Set([
      ...config.resolver.platforms,
      MetroFileMap.H.NATIVE_PLATFORM,
    ]),
    hasteImplModulePath: config.resolver.hasteImplModulePath,
    enableHastePackages: config.resolver.enableGlobalPackages,
    rootDir: config.projectRoot,
    failValidationOnConflicts: options?.throwOnModuleCollision ?? true,
  });

  const fileMap = new MetroFileMap({
    cacheManagerFactory:
      config?.unstable_fileMapCacheManagerFactory ??
      (factoryParams =>
        new DiskCacheManager(factoryParams, {
          cacheDirectory:
            config.fileMapCacheDirectory ?? config.hasteMapCacheDirectory,
          cacheFilePrefix: options?.cacheFilePrefix,
          autoSave,
        })),
    perfLoggerFactory: config.unstable_perfLoggerFactory,
    computeDependencies,
    computeSha1: !config.watcher.unstable_lazySha1,
    dependencyExtractor: config.resolver.dependencyExtractor,
    enableSymlinks: true,
    enableWorkerThreads: config.watcher.unstable_workerThreads,
    extensions: Array.from(
      new Set([
        ...config.resolver.sourceExts,
        ...config.resolver.assetExts,
        ...config.watcher.additionalExts,
      ]),
    ),
    forceNodeFilesystemAPI: !config.resolver.useWatchman,
    healthCheck: config.watcher.healthCheck,
    ignorePattern: getIgnorePattern(config),
    maxWorkers: config.maxWorkers,
    plugins: [hasteMap],
    retainAllFiles: true,
    resetCache: config.resetCache,
    rootDir: config.projectRoot,
    roots: config.watchFolders,
    useWatchman: config.resolver.useWatchman,
    watch,
    watchmanDeferStates: config.watcher.watchman.deferStates,
  });
  return {fileMap, hasteMap};
}
