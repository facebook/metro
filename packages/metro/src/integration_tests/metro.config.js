/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

const path = require('path');

const ROOT_PATH = path.resolve(__dirname, 'basic_bundle');

module.exports = {
  cacheStores: [],
  maxWorkers: 1,
  projectRoot: ROOT_PATH,
  reporter: {update() {}},
  watchFolders: [path.resolve(__dirname, '../../../')],
  server: {port: 10028},
  resolver: {
    useWatchman: false,
  },
  transformer: {
    assetRegistryPath: path.join(ROOT_PATH, 'AssetRegistry'),
    asyncRequireModulePath: require.resolve(
      'metro-runtime/src/modules/asyncRequire',
    ),
    babelTransformerPath: require.resolve(
      'metro-react-native-babel-transformer',
    ),
    enableBabelRCLookup: false,
    enableBabelRuntime: false,
    getTransformOptions: async () => ({
      transform: {experimentalImportSupport: true, inlineRequires: false},
      preloadedModules: false,
      ramGroups: [],
    }),
  },
};
