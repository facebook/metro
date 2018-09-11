/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

let resolvedConfig = {};
let loadHasBeenCalled = false;
let returnNull = false;

const cosmiconfig = jest.fn(() => ({
  search: async () =>
    returnNull
      ? null
      : {
          filepath: '/metro.config.js',
          config: resolvedConfig,
        },
  load: async path => {
    loadHasBeenCalled = true;
    return {
      filepath: path,
      config: resolvedConfig,
    };
  },
}));

cosmiconfig.setResolvedConfig = config => {
  resolvedConfig = config;
};

cosmiconfig.setReturnNull = shouldReturnNull => {
  returnNull = shouldReturnNull;
};

cosmiconfig.reset = () => {
  loadHasBeenCalled = false;
  returnNull = false;
};

cosmiconfig.hasLoadBeenCalled = () => {
  return loadHasBeenCalled;
};

module.exports = cosmiconfig;
