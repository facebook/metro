/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const escapeRegExp = require('escape-string-regexp');
const path = require('path');

let _only = [];

function register(onlyList) {
  // This prevents `babel-register` from transforming the code of the
  // plugins/presets that we are require-ing themselves before setting up the
  // actual config.
  require('@babel/register')({only: [], babelrc: false, configFile: false});
  require('@babel/register')(config(onlyList));
}

function config(onlyList, options) {
  _only = _only.concat(onlyList);
  return {
    babelrc: false,
    compact: false,
    configFile: false,
    ignore: null,
    only: _only,
    plugins: [
      [require('@babel/plugin-transform-flow-strip-types').default],
      [require('@babel/plugin-proposal-class-properties').default],
      [
        require('@babel/plugin-transform-modules-commonjs').default,
        {
          lazy: options && options.lazy,
        },
      ],
      [require('@babel/plugin-proposal-nullish-coalescing-operator').default],
      [require('@babel/plugin-proposal-optional-chaining').default],
    ],
    presets: [],
    retainLines: true,
    sourceMaps: 'inline',
  };
}

/**
 * We use absolute paths for matching only the top-level folders reliably. For
 * example, we would not want to match some deeply nested folder that happens to
 * have the same name as one of `BABEL_ENABLED_PATHS`.
 */
function buildRegExps(basePath, dirPaths) {
  return dirPaths.map(folderPath =>
    // Babel cares about Windows/Unix paths since v7b44
    // https://github.com/babel/babel/issues/8184
    // basePath + path.sep + dirPath/dirRegex
    // /home/name/webroot/js + / + relative/path/to/exclude
    // c:\home\name\webroot\js + \ + relative\path\to\exclude
    folderPath instanceof RegExp
      ? new RegExp(
          `^${escapeRegExp(path.resolve(basePath, '.') + path.sep)}${
            folderPath.source // This is an actual regex value, don't escape it.
          }`,
          folderPath.flags,
        )
      : new RegExp('^' + escapeRegExp(path.resolve(basePath, folderPath))),
  );
}

module.exports = register;
module.exports.config = config;
module.exports.buildRegExps = buildRegExps;
