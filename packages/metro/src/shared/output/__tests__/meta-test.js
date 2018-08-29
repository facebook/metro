/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 * @flow strict
 */
'use strict';

const meta = require('../meta');

it('exports the blacklist creator', () => {
  expect(meta('some formatted code', 'utf8')).toMatchSnapshot();
});
