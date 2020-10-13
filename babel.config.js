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

const crypto = require('crypto');
const fs = require('fs');

// eslint-disable-next-line prettier/prettier
/*::
import type {BabelCoreOptions} from '@babel/core';
*/

const plugins = [
  '@babel/plugin-proposal-object-rest-spread',
  '@babel/plugin-transform-async-to-generator',
  '@babel/plugin-transform-destructuring',
  '@babel/plugin-transform-flow-strip-types',
  '@babel/plugin-syntax-dynamic-import',
  '@babel/plugin-proposal-nullish-coalescing-operator',
  '@babel/plugin-proposal-optional-chaining',

  // TODO: Check if plugins from the list below are actually in use
  '@babel/plugin-proposal-class-properties',
  '@babel/plugin-transform-modules-commonjs',
  '@babel/plugin-transform-parameters',
  '@babel/plugin-transform-react-jsx',
  '@babel/plugin-transform-spread',
];

const presets = ['babel-preset-jest'];

function getConfig(api /*: any */) /*: BabelCoreOptions */ {
  api.cache.never();

  return {
    babelrc: false,
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
