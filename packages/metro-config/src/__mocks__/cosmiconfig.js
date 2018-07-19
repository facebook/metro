/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const cosmiconfig = jest.fn(() => ({
  search: async () => ({
    filepath: '/metro.config.js',
    config: resolvedConfig,
  }),
  load: async path => {
    loadHasBeenCalled = true;
    return {
      filepath: path,
      config: resolvedConfig,
    };
  },
}));
let resolvedConfig = {};
let loadHasBeenCalled = false;

cosmiconfig.setResolvedConfig = config => {
  resolvedConfig = config;
};

cosmiconfig.resetCalledTest = () => {
  loadHasBeenCalled = false;
};

cosmiconfig.hasLoadBeenCalled = () => {
  return loadHasBeenCalled;
};

module.exports = cosmiconfig;
