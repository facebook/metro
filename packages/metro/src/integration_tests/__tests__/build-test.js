/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const Metro = require('../../..');

jest.unmock('cosmiconfig');

jasmine.DEFAULT_TIMEOUT_INTERVAL = 30 * 1000;

it('builds a simple bundle', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });

  const result = await Metro.runBuild(config, {
    entry: 'TestBundle.js',
  });

  expect(result.code).toMatchSnapshot();
});
