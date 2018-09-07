/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
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
  getWatchFolders = () => [];
}

module.exports = {
  resolver: {
    resolveRequest,
  },
  projectRoot: fs.realpathSync(path.resolve(__dirname, '../../../')),
  watchFolders: getWatchFolders(),
  server: {port: 10028},
  transformer: {
    babelTransformerPath: require.resolve('./transformer'),
    workerPath: require.resolve('./transformWorker'),
  },
};
