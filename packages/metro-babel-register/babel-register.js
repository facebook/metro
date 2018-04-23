/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */
'use strict';

require('./node-polyfills');

var _only = [];

const PLUGINS = [
  require('@babel/plugin-transform-flow-strip-types'),
  require('@babel/plugin-proposal-object-rest-spread'),
  require('@babel/plugin-proposal-class-properties'),
  require('@babel/plugin-transform-modules-commonjs'),
];

if (/^v[0-7]\./.test(process.version)) {
  PLUGINS.push(require('@babel/plugin-transform-async-to-generator'));
}

function registerOnly(onlyList) {
  // This prevents `babel-register` from transforming the code of the
  // plugins/presets that we are require-ing themselves before setting up the
  // actual config.
  require('@babel/register')({only: [], babelrc: false});
  require('@babel/register')(config(onlyList));
}

function config(onlyList) {
  _only = _only.concat(onlyList);
  return {
    presets: [],
    plugins: PLUGINS,
    only: _only,
    retainLines: true,
    sourceMaps: 'inline',
    babelrc: false,
  };
}

module.exports = registerOnly;
module.exports.config = config;
