/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @flow (won't like this)
 * @format
 */

'use strict';

// This is a temporary migration bridge to switch between babel 6 and 7

const makeHMRConfig7 = makeMakeHMRConfig7();

module.exports = {
  makeHMRConfig: makeHMRConfig7,
  getPreset,
};

function makeMakeHMRConfig7() {
  // from: babel-preset-react-native/configs/hmr
  /**
   * Copyright (c) 2015-present, Facebook, Inc.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */
  'use strict';

  var path = require('path');
  var hmrTransform = 'react-transform-hmr/lib/index.js';
  var transformPath = require.resolve(hmrTransform);

  return function(options: mixed, filename?: string) {
    var transform = filename
      ? './' + path.relative(path.dirname(filename), transformPath) // packager can't handle absolute paths
      : hmrTransform;

    // Fix the module path to use '/' on Windows.
    if (path.sep === '\\') {
      transform = transform.replace(/\\/g, '/');
    }

    return {
      plugins: [
        [
          require('metro-babel7-plugin-react-transform'),
          {
            transforms: [
              {
                transform,
                imports: ['react'],
                locals: ['module'],
              },
            ],
          },
        ],
      ],
    };
  };
}

function getPreset(name: string) {
  if (!/^(?:@babel\/|babel-)preset-/.test(name)) {
    try {
      name = require.resolve(`babel-preset-${name}`);
    } catch (error) {
      if (error && error.conde === 'MODULE_NOT_FOUND') {
        name = require.resolve(`@babel/preset-${name}`);
      }
    }
  }
  //$FlowFixMe: TODO t26372934 this has to be dynamic
  return require(name);
}
