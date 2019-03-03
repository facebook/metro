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

const path = require('path');

const {createTransformer} = require('babel-jest');

/**
 * babel@7 introduced changes in config lookup.
 *
 * @see https://babeljs.io/docs/en/config-files#6x-vs-7x-babelrc-loading
 */
module.exports = createTransformer({
  root: path.join(__dirname, '..'),
});
