/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

const template = require('babel-template');

const makeAsyncRequire = template('require.async(ARGS)');

const plugin = {
  inherits: require('babel-plugin-syntax-dynamic-import'),
  visitor: {
    CallExpression(path) {
      if (path.node.callee.type !== 'Import') {
        return;
      }
      const newImport = makeAsyncRequire({ARGS: path.node.arguments});
      path.replaceWith(newImport);
    },
  },
};

module.exports = plugin;
