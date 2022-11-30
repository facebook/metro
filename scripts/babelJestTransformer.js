/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

const {createTransformer} = require('babel-jest').default;

const BABEL_CONFIG_PATH = require.resolve('../babel.config.js');

const transformer /*: any */ = createTransformer({
  configFile: BABEL_CONFIG_PATH,
});

module.exports = transformer;
