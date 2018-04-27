/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */
'use strict';

const escapeRegExp = require('escape-string-regexp');
const path = require('path');
require('./node-polyfills');

var _only = [];

const PLUGINS = [
  require('@babel/plugin-transform-flow-strip-types'),
  require('@babel/plugin-proposal-object-rest-spread'),
  require('@babel/plugin-proposal-class-properties'),
  require('@babel/plugin-transform-modules-commonjs'),
  require('@babel/plugin-proposal-optional-chaining'),
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
    babelrc: false,
    ignore: null,
    only: _only,
    parserOpts: {plugins: ['optionalChaining']},
    plugins: PLUGINS,
    presets: [],
    retainLines: true,
    sourceMaps: 'inline',
  };
}

/**
 * We use absolute paths for matching only the top-level folders reliably. For
 * example, we would not want to match some deeply nested forder that happens to
 * have the same name as one of `BABEL_ENABLED_PATHS`.
 */
function buildRegExps(basePath, dirPaths) {
  return dirPaths.map(
    folderPath =>
      // Babel `only` option works with forward slashes in the RegExp so replace
      // backslashes for Windows.
      folderPath instanceof RegExp
        ? new RegExp(
            `^${escapeRegExp(
              path.resolve(basePath, '.').replace(/\\/g, '/'),
            )}/${folderPath.source}`,
            folderPath.flags,
          )
        : new RegExp(
            `^${escapeRegExp(
              path.resolve(basePath, folderPath).replace(/\\/g, '/'),
            )}`,
          ),
  );
}

module.exports = registerOnly;
module.exports.config = config;
module.exports.buildRegExps = buildRegExps;
