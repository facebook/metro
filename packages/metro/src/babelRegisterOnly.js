/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */
'use strict';

require('./setupNodePolyfills');

var _only = [];

const PLUGINS = [
  'transform-flow-strip-types',
  'transform-object-rest-spread',
  'transform-class-properties',
];

if (/^v[0-7]\./.test(process.version)) {
  PLUGINS.push(
    'transform-async-to-generator',
    'syntax-trailing-function-commas',
  );
}

function registerOnly(onlyList) {
  // This prevents `babel-register` from transforming the code of the
  // plugins/presets that we are require-ing themselves before setting up the
  // actual config.
  require('babel-register')({only: [], babelrc: false});
  require('babel-register')(config(onlyList));
}

function config(onlyList) {
  _only = _only.concat(onlyList);
  return {
    presets: [require('babel-preset-es2015-node')],
    plugins: PLUGINS.map(pluginName => require(`babel-plugin-${pluginName}`)),
    only: _only,
    retainLines: true,
    sourceMaps: 'inline',
    babelrc: false,
  };
}

module.exports = registerOnly;
module.exports.config = config;
