/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

'use strict';

const os = require('os');

module.exports = (workers: ?number): number => {
  return typeof workers === 'number' && Number.isInteger(workers)
    ? workers
    : os.availableParallelism();
};
