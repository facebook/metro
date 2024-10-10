/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

const ignoredTests = {
  // "path/ending-with/test-name.js": ["test name 1", "test name 2"]
};

if (process.env.YARN_INSTALL_NO_LOCKFILE) {
  // flaky babel types test - this should be removed once babel is updated
  ignoredTests['__tests__/babel-lib-defs-test.js'] = [
    'Babel Flow library definitions should be up to date',
  ];
}

module.exports = ignoredTests;
