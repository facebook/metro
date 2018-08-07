/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @flow
 * @format
 */

'use strict';

const Metro = require('../../..');
const MetroConfig = require('metro-config');

const path = require('path');

jest.unmock('cosmiconfig');

jasmine.DEFAULT_TIMEOUT_INTERVAL = 30 * 1000;

const INPUT_PATH = path.resolve(__dirname, '../basic_bundle');

it('builds a simple bundle', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });

  const result = await Metro.runBuild(config, {
    entry: 'TestBundle.js',
  });

  expect(result.code).toMatchSnapshot();
});

it('build a simple bundle with polyfills', async () => {
  const polyfill1 = path.join(INPUT_PATH, 'polyfill-1.js');
  const polyfill2 = path.join(INPUT_PATH, 'polyfill-2.js');

  const baseConfig = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const config = MetroConfig.mergeConfig(baseConfig, {
    serializer: {
      polyfillModuleNames: [polyfill1, polyfill2],
    },
  });

  const bundleWithPolyfills = await Metro.runBuild(config, {
    entry: 'TestBundle.js',
  });
  expect(bundleWithPolyfills.code).toMatchSnapshot();
});
