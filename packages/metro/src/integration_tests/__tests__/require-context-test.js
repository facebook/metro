/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

const Metro = require('../../..');
const execBundle = require('../execBundle');

jest.unmock('cosmiconfig');

jest.setTimeout(30 * 1000);

it('require-context/matching.js', async () => {
  await expect(
    execTest('require-context/matching.js'),
  ).resolves.toMatchSnapshot();
});

it('require-context/mode-lazy.js', async () => {
  await expect(
    execTest('require-context/mode-lazy.js'),
  ).resolves.toMatchSnapshot();
});

it('require-context/mode-lazy-once.js', async () => {
  await expect(
    execTest('require-context/mode-lazy-once.js'),
  ).resolves.toMatchSnapshot();
});

it('require-context/mode-eager.js', async () => {
  await expect(
    execTest('require-context/mode-eager.js'),
  ).resolves.toMatchSnapshot();
});

it('require-context/mode-sync.js', async () => {
  await expect(
    execTest('require-context/mode-sync.js'),
  ).resolves.toMatchSnapshot();
});

it('require-context/conflict.js', async () => {
  await expect(
    execTest('require-context/conflict.js'),
  ).resolves.toMatchSnapshot();
});

async function execTest(entry) {
  const config = await Metro.loadConfig(
    {
      config: require.resolve('../metro.config.js'),
    },
    {
      transformer: {
        unstable_allowRequireContext: true,
      },
    },
  );

  const result = await Metro.runBuild(config, {
    entry,
  });

  return execBundle(result.code);
}
