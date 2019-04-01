/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @flow
 * @format
 */

'use strict';

const Metro = require('../../..');
const MetroConfig = require('metro-config');

const execBundle = require('../execBundle');
const path = require('path');

jest.unmock('cosmiconfig');

jest.setTimeout(30 * 1000);

const INPUT_PATH = path.resolve(__dirname, '../basic_bundle');

it('builds a simple bundle', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });

  const result = await Metro.runBuild(config, {
    entry: 'TestBundle.js',
  });

  expect(execBundle(result.code)).toMatchSnapshot();
});

it('build a simple bundle with polyfills', async () => {
  const baseConfig = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const config = MetroConfig.mergeConfig(baseConfig, {
    serializer: {
      polyfillModuleNames: [path.join(INPUT_PATH, 'polyfill.js')],
    },
  });

  const result = await Metro.runBuild(config, {
    entry: 'TestPolyfill.js',
  });
  expect(execBundle(result.code)).toBe('POLYFILL_IS_INJECTED');
});
