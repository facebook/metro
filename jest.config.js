/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/** @type {import('jest').Config} **/
module.exports = {
  filter: '<rootDir>/scripts/jestFilter.js',
  modulePathIgnorePatterns: ['/node_modules/', 'packages/[^/]+/build/'],
  snapshotFormat: {
    escapeString: true,
    printBasicPrototype: true,
  },
  testEnvironment: 'node',
  testRegex: '/__tests__/.*-test\\.js$',
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
