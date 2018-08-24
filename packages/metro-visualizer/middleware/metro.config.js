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

const path = require('path');

module.exports = {
  projectRoot: path.resolve(__dirname, '../'),
  transformModulePath: require.resolve('../transformer'),
  watchFolders: [path.resolve(__dirname, '../../../../')],
  server: {port: 10028},
  transformer: {
    babelTransformerPath: require.resolve('../transformer'),
    workerPath: require.resolve('./transformWorker'),
  },
};
