/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

module.exports = function jestConfig() {
  const testPathIgnorePatterns = [];
  if (process.env.NIGHTLY_TESTS_NO_LOCKFILE) {
    // flaky babel types test - this should be removed once babel is updated
    testPathIgnorePatterns.push('__tests__/babel-lib-defs-test.js');
  }

  /** @type {import('jest').Config} **/
  const config = {
    modulePathIgnorePatterns: ['/node_modules/', 'packages/[^/]+/build/'],
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true,
    },
    testEnvironment: 'node',
    testRegex: '/__tests__/.*-test\\.js$',
    testPathIgnorePatterns,
    fakeTimers: {
      enableGlobally: true,
      legacyFakeTimers: false,
    },
    transform: {
      '\\.js$': '<rootDir>/scripts/babelJestTransformer.js',
    },
    setupFiles: ['<rootDir>/scripts/setupJest.js'],
    watchPlugins: [
      'jest-watch-typeahead/filename',
      'jest-watch-typeahead/testname',
    ],
  };
  return config;
};
