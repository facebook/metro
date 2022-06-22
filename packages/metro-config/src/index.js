/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

export type * from './configTypes.flow';

const getDefaultConfig = require('./defaults');
const {loadConfig, mergeConfig, resolveConfig} = require('./loadConfig');

module.exports = {
  loadConfig,
  resolveConfig,
  mergeConfig,
  getDefaultConfig,
};
