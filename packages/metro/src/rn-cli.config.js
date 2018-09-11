/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * React Native CLI configuration file
 *
 * @format
 * @flow
 */
'use strict';

const blacklist = require('metro-config/src/defaults/blacklist');
const path = require('path');

module.exports = {
  getProjectRoot() {
    // Match on either path separator
    if (__dirname.match(/node_modules[\/\\]metro(-bundler)?$/)) {
      // Metro Bundler is running from node_modules of another project
      return path.resolve(__dirname, '../../..');
    } else if (__dirname.match(/Pods\/React\/packager$/)) {
      // Metro Bundler is running from node_modules of another project
      return path.resolve(__dirname, '../../..');
    } else {
      return path.resolve(__dirname, '..');
    }
  },

  getAssetExts() {
    return [];
  },

  getSourceExts() {
    return [];
  },

  getBlacklistRE() {
    return blacklist();
  },

  getTransformModulePath() {
    return require.resolve('./reactNativeTransformer');
  },
};
