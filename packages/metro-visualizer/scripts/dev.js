/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

require('@babel/register')({
  presets: ['@babel/env', '@babel/preset-react', '@babel/preset-flow'],
  plugins: ['@babel/plugin-proposal-class-properties'],
  only: [/metro/],
  ignore: [/node_modules/],
});

const Metro = require('metro');

async function dev() {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });

  await Metro.runServer(config, {});
}

dev();
