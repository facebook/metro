/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @flow
 * @format
 */

'use strict';

// imported from: babel-preset-react-native/configs/hmr

const path = require('path');
const hmrTransform = 'react-transform-hmr/lib/index.js';
const transformPath = require.resolve(hmrTransform);

function makeHMRConfig(options: mixed, filename?: string) {
  // We need to get a _path_ to transform relative to/from.
  // Either take the filename that is passed on or use the transform as base.
  let relativePath = filename
    ? // packager can't handle absolute paths
      './' + path.relative(path.dirname(filename), transformPath)
    : hmrTransform;

  // Fix the module path to use '/' on Windows.
  if (path.sep === '\\') {
    relativePath = relativePath.replace(/\\/g, '/');
  }

  return {
    plugins: [
      [
        // This is a Babel 7 compatible fork
        // of https://github.com/gaearon/babel-plugin-react-transform
        require('metro-babel7-plugin-react-transform'),
        {
          transforms: [
            {
              transform: relativePath,
              imports: ['react'],
              locals: ['module'],
            },
          ],
        },
      ],
    ],
  };
}

module.exports = makeHMRConfig;
