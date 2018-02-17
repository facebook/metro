/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 * @flow
 */
'use strict';

const metro = require('..');

it('exports the blacklist creator', () => {
  expect(metro.createBlacklist).toBeDefined();
});
