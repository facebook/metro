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

type Options = {isPrefetchOnly: boolean, ...};
type MetroRequire = {
  (number): mixed,
  importAll: number => mixed,
  ...
};

declare var require: MetroRequire;

const DEFAULT_OPTIONS = {isPrefetchOnly: false};

type DependencyMapPaths = ?$ReadOnly<{[moduleID: number | string]: mixed}>;

declare var __METRO_GLOBAL_PREFIX__: string;

async function asyncRequireImpl(
  moduleID: number,
  paths: DependencyMapPaths,
  options: Options,
): Promise<mixed> {
  const loadBundle: (bundlePath: mixed) => Promise<void> =
    global[`${__METRO_GLOBAL_PREFIX__}__loadBundleAsync`];

  if (loadBundle != null) {
    const stringModuleID = String(moduleID);
    if (paths != null) {
      const bundlePath = paths[stringModuleID];
      if (bundlePath != null) {
        // NOTE: Errors will be swallowed by asyncRequire.prefetch
        await loadBundle(bundlePath);
      }
    }
  }

  if (!options.isPrefetchOnly) {
    return require.importAll(moduleID);
  }

  return undefined;
}

async function asyncRequire(
  moduleID: number,
  paths: DependencyMapPaths,
  moduleName?: string,
): Promise<mixed> {
  return asyncRequireImpl(moduleID, paths, DEFAULT_OPTIONS);
}

asyncRequire.prefetch = function (
  moduleID: number,
  paths: DependencyMapPaths,
  moduleName?: string,
): void {
  asyncRequireImpl(moduleID, paths, {isPrefetchOnly: true}).then(
    () => {},
    () => {},
  );
};

module.exports = asyncRequire;
