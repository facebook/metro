/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

const testPathIgnorePatterns = [];
if (process.env.NIGHTLY_TESTS_NO_LOCKFILE) {
  // flaky babel types test - this should be removed once babel is updated
  testPathIgnorePatterns.push('__tests__/babel-lib-defs-test.js');
}

if (process.platform === 'win32') {
  // TODO: fix on windows
  testPathIgnorePatterns.push(
    ...[
      // path mismatches
      'packages/metro/src/__tests__/HmrServer-test.js',
      'packages/metro/src/DeltaBundler/__tests__/buildSubgraph-test.js',
      'packages/metro/src/DeltaBundler/__tests__/Graph-test.js',
      'packages/metro/src/DeltaBundler/Serializers/helpers/__tests__/js-test.js',
      'packages/metro/src/node-haste/lib/__tests__/AssetPaths-test.js',
      'packages/metro/src/Server/__tests__/Server-test.js',
      'packages/metro-config/src/__tests__/loadConfig-test.js',
      'packages/metro-symbolicate/src/__tests__/symbolicate-test.js',
      'packages/metro-file-map/src/__tests__/index-test.js',
      'packages/metro-file-map/src/crawlers/__tests__/node-test.js',
      'packages/metro-resolver/src/__tests__/package-imports-test.js',

      // resolveModulePath failed
      'packages/metro-cache/src/stores/__tests__/FileStore-test.js',
      'packages/metro-resolver/src/__tests__/assets-test.js',
      'packages/metro-resolver/src/__tests__/platform-extensions-test.js',
      'packages/metro-resolver/src/__tests__/symlinks-test.js',

      // const {_cwd} = this; resolution issue in `metro-memory-fs/src/index.js:1294:15`
      'packages/metro/src/__tests__/Assets-test.js',
      'packages/metro/src/DeltaBundler/__tests__/resolver-test.js',
      'packages/buck-worker-tool/src/__tests__/worker-test.js',
      'packages/metro-transform-worker/src/__tests__/index-test.js',
      'packages/metro-cache/src/stores/__tests__/AutoCleanFileStore-test.js',
      'packages/metro-cache/src/stores/__tests__/FileStore-test.js',

      // endless loading
      'packages/metro-resolver/src/__tests__/browser-spec-test.js',
      'packages/metro-resolver/src/__tests__/package-exports-test.js',
      'packages/metro-resolver/src/__tests__/index-test.js',

      // unclear issue
      'packages/metro/src/DeltaBundler/__tests__/DeltaCalculator-test.js',
      'packages/metro-file-map/src/crawlers/__tests__/integration-test.js',
    ],
  );
}

/** @type {import('jest').Config} **/
module.exports = {
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
