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

const fs = require('fs');
const path = require('path');

let resolveRequest;
let getWatchFolders;
try {
  /* eslint-disable import/no-extraneous-dependencies */
  resolveRequest = require('@xplatjs/metro-scripts/resolver');
  getWatchFolders = require('@xplatjs/metro-scripts/get-watch-folders');
  /* eslint-enable import/no-extraneous-dependencies */
} catch (e) {
  resolveRequest = undefined;
  getWatchFolders = () => [
    fs.realpathSync(path.resolve(__dirname, './')),
    fs.realpathSync(path.resolve(__dirname, './../..')),
  ];
}

module.exports = {
  dev: true,
  resolver: {
    resolveRequest,
  },
  projectRoot: fs.realpathSync(path.resolve(__dirname, './')),
  watchFolders: getWatchFolders(),
  server: {port: 8080, enableVisualizer: true},
  transformer: {
    babelTransformerPath: require.resolve(
      './src/middleware/build-utils/transformer',
    ),
    workerPath: require.resolve('./src/middleware/build-utils/transformWorker'),
  },
};
