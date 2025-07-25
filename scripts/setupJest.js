/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

// Make sure nothing registers Babel on top of Jest's setup during tests.
require('metro-babel-register').unstable_registerForMetroMonorepo = () => {};

/**
 * Prettier v3 uses import (cjs/mjs) file formats that jest-runtime does not
 * support. To work around this we need to bypass the jest module system by
 * using the orginal node `require` function.
 */
jest.mock('prettier', () => {
  const module = jest.requireActual('module');
  return module.prototype.require(require.resolve('prettier'));
});
