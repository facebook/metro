/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const path = require('path');

const ROOT_PATH = path.resolve(__dirname, 'basic_bundle');

module.exports = {
  assetRegistryPath: path.join(ROOT_PATH, 'AssetRegistry'),
  cacheStores: [],
  getProjectRoot: () => ROOT_PATH,
  getTransformModulePath: () =>
    require.resolve('metro/src/reactNativeTransformer'),
  getWatchFolders: () => [path.resolve(__dirname, '..')],
  getWorkerPath: () => path.resolve(__dirname, 'transformWorker.js'),
};
