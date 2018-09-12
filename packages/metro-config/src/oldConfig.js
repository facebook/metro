/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */
'use strict';

const blacklist = require('./defaults/blacklist');
const os = require('os');
const path = require('path');

const {providesModuleNodeModules} = require('./defaults/defaults');
const {FileStore} = require('metro-cache');

import type {OldConfigT as ConfigT} from './configTypes.flow.js';

const DEFAULT = ({
  assetRegistryPath: 'missing-asset-registry-path',
  enhanceMiddleware: middleware => middleware,
  extraNodeModules: {},
  assetTransforms: false,
  cacheStores: [
    new FileStore({
      root: path.join(os.tmpdir(), 'metro-cache'),
    }),
  ],
  cacheVersion: '1.0',
  dynamicDepsInPackages: 'throwAtRuntime',
  getAsyncRequireModulePath: () => 'metro/src/lib/bundle-modules/asyncRequire',
  getAssetExts: () => [],
  getBlacklistRE: () => blacklist(),
  getEnableBabelRCLookup: () => true,
  getPlatforms: () => [],
  getPolyfillModuleNames: () => [],
  getProjectRoots: undefined,
  // We assume the default project path is two levels up from
  // node_modules/metro/
  getProjectRoot: () => path.resolve(__dirname, '../../..'),
  getWatchFolders: () => [],
  getProvidesModuleNodeModules: () => providesModuleNodeModules.slice(),
  getRunModuleStatement: (moduleId: number | string) =>
    `__r(${JSON.stringify(moduleId)});`,
  getSourceExts: () => [],
  getTransformModulePath: () => 'metro/src/defaultTransformer',
  getTransformOptions: async () => ({
    transform: {experimentalImportSupport: false, inlineRequires: false},
    preloadedModules: false,
    ramGroups: [],
  }),
  getPolyfills: () => [],
  getUseGlobalHotkey: () => true,
  postMinifyProcess: x => x,
  postProcessBundleSourcemap: ({code, map, outFileName}) => ({code, map}),
  resolveRequest: null,
  getResolverMainFields: () => ['browser', 'main'],
  getModulesRunBeforeMainModule: () => [],
  getWorkerPath: () => null,
  processModuleFilter: module => true,
}: ConfigT);

module.exports = {
  DEFAULT,
};
