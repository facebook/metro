/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

const Metro = require('../../..');
const execBundle = require('../execBundle');

jest.unmock('cosmiconfig');

jest.setTimeout(30 * 1000);

test('builds a simple bundle', async () => {
  const config = await Metro.loadConfig(
    {
      config: require.resolve('../metro.config.js'),
    },
    {
      transformer: {
        allowOptionalDependencies: true,
      },
    },
  );

  const result = await Metro.runBuild(config, {
    entry: 'optional-dependencies/index.js',
  });

  const object = execBundle(result.code);

  expect(object).toEqual({
    a: 'a',
    b: 'b',
    c: 'c',
  });
});
