/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 * @flow
 */

'use strict';

const acorn = require('acorn');
const vm = require('vm');

module.exports = function execBundle(code: string, context: {...} = {}): mixed {
  // The tests are configured to use the React Native babel preset,
  // which supports modern JavaScriptCore and Hermes.
  acorn.parse(code, {ecmaVersion: 2015});

  return vm.runInNewContext(code, context);
};
