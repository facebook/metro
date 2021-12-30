/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');

// eslint-disable-next-line prettier/prettier
/*::
import type {BabelCoreOptions} from '@babel/core';
*/
const plugins = [
  '@babel/plugin-transform-flow-strip-types',
  '@babel/plugin-proposal-nullish-coalescing-operator', // Node 14
  '@babel/plugin-proposal-optional-chaining', // Node 14
  '@babel/plugin-transform-modules-commonjs',
  '@babel/plugin-syntax-class-properties',
];

const presets = [];

function getConfig(api /*: any */) /*: BabelCoreOptions */ {
  api.cache.never();

  return {
    babelrc: false,
    browserslistConfigFile: false,
    presets: presets.map(preset => require.resolve(preset)),
    plugins: plugins.map(plugin => require.resolve(plugin)),
  };
}

getConfig.getCacheKey = () /*: string */ => {
  const dependencies = [...plugins, ...presets].map(dependency =>
    require.resolve(`${dependency}/package.json`),
  );

  const hash = crypto.createHash('md5');
  dependencies.forEach(dependency =>
    hash.update('\0', 'utf8').update(fs.readFileSync(dependency)),
  );
  return hash.digest('hex');
};

module.exports = getConfig;
