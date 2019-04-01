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

let getWatchFolders;

try {
  /* eslint-disable import/no-extraneous-dependencies */
  getWatchFolders = require('@xplatjs/metro-scripts/get-watch-folders');
  /* eslint-enable import/no-extraneous-dependencies */
} catch (e) {
  getWatchFolders = () => [
    fs.realpathSync(path.resolve(__dirname, '../../../../../')),
  ];
}

module.exports = {
  projectRoot: fs.realpathSync(path.resolve(__dirname, '../../../')),
  watchFolders: getWatchFolders(),
  server: {port: 10028},
  transformer: {
    babelTransformerPath: require.resolve('./transformer'),
    workerPath: require.resolve('./transformWorker'),
  },
};
