/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 * @flow strict
 */

'use strict';

jest.mock('os');

const getMaxWorkers = require('../getMaxWorkers');
const os = require('os');

test('calculates the number of max workers', () => {
  /* $FlowFixMe(>=0.99.0 site=react_native_fb) This comment suppresses an error
   * found when Flow v0.99 was deployed. To see the error, delete this comment
   * and run Flow. */
  os.cpus.mockReturnValue({length: 1});
  expect(getMaxWorkers()).toBe(1);
  /* $FlowFixMe(>=0.99.0 site=react_native_fb) This comment suppresses an error
   * found when Flow v0.99 was deployed. To see the error, delete this comment
   * and run Flow. */
  os.cpus.mockReturnValue({length: 8});
  expect(getMaxWorkers()).toBe(6);
  /* $FlowFixMe(>=0.99.0 site=react_native_fb) This comment suppresses an error
   * found when Flow v0.99 was deployed. To see the error, delete this comment
   * and run Flow. */
  os.cpus.mockReturnValue({length: 24});
  expect(getMaxWorkers()).toBe(14);
  expect(getMaxWorkers(5)).toBe(5);
});
