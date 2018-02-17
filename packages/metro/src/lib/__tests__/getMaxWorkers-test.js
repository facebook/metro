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

jest.mock('os');

const getMaxWorkers = require('../getMaxWorkers');
const os = require('os');

test('calculates the number of max workers', () => {
  os.cpus.mockReturnValue({length: 1});
  expect(getMaxWorkers()).toBe(1);
  os.cpus.mockReturnValue({length: 8});
  expect(getMaxWorkers()).toBe(6);
  os.cpus.mockReturnValue({length: 24});
  expect(getMaxWorkers()).toBe(14);
  expect(getMaxWorkers(5)).toBe(5);
});
