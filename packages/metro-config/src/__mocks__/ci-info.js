/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const ci = jest.genMockFromModule('ci-info');

ci.reset = () => {
  ci.isCI = false;
};

ci.setCI = () => {
  ci.isCI = true;
};

module.exports = ci;
