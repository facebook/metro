/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const escapeRegExp = require('escape-string-regexp');
const fs = require('fs');
const path = require('path');

let _only = [];

function register(onlyList) {
  // This prevents `babel-register` from transforming the code of the
  // plugins/presets that we are require-ing themselves before setting up the
  // actual config.
  require('@babel/register')({only: [], babelrc: false, configFile: false});
  require('@babel/register')({
    ...config(onlyList),
    extensions: [
      '.ts',
      '.tsx',
      // Babel's default extensions
      '.es6',
      '.es',
      '.jsx',
      '.js',
      '.mjs',
    ],
  });
}

function config(onlyList, options) {
  _only = _only.concat(onlyList);
  return {
    babelrc: false,
    compact: false,
    configFile: false,
    browserslistConfigFile: false,
    ignore: null,
    only: _only,
    plugins: [
      [require('@babel/plugin-transform-flow-strip-types').default],
      [
        require('@babel/plugin-transform-modules-commonjs').default,
        {
          lazy: options && options.lazy,
        },
      ],
      [require('@babel/plugin-proposal-nullish-coalescing-operator').default],
      [require('@babel/plugin-proposal-optional-chaining').default],
      [require('@babel/plugin-syntax-class-properties').default],
    ],
    presets: [],
    retainLines: true,
    sourceMaps: 'inline',
    overrides: [
      {
        test: /\.tsx?$/,
        plugins: [
          require('babel-plugin-replace-ts-export-assignment'),
          require('./plugins/babel-plugin-metro-replace-ts-require-assignment'),
        ],
        presets: [
          [
            require('@babel/preset-typescript').default,
            {
              // will be the default in Babel 8, so let's just turn it on now
              allowDeclareFields: true,
              // will be default in the future, but we don't want to use it
              allowNamespaces: false,
            },
          ],
        ],
      },
    ],
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

let isRegisteredForMetroMonorepo = false;

function registerForMetroMonorepo() {
  // Noop if we have already registered Babel here.
  if (isRegisteredForMetroMonorepo) {
    return;
  }
  // Noop if we are in NODE_ENV=production.
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  // Noop if we seem to be outside of the Metro source tree.
  if (
    !__dirname.endsWith(
      ['', 'packages', 'metro-babel-register', 'src'].join(path.sep),
    )
  ) {
    return;
  }
  // Bail out if prepare-release has run here.
  if (
    fs.existsSync(
      path.join(__dirname, '..', 'src.real', path.basename(__filename)),
    )
  ) {
    return;
  }
  register([path.resolve(__dirname, '..', '..')]);
  isRegisteredForMetroMonorepo = true;
}

module.exports = register;
module.exports.config = config;
module.exports.buildRegExps = buildRegExps;
module.exports.unstable_registerForMetroMonorepo = registerForMetroMonorepo;
