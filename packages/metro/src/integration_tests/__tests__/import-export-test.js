/**
 * Copyright (c) Facebook, Inc. and its affiliates.
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

it('builds a simple bundle', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });

  const result = await Metro.runBuild(config, {
    entry: 'import-export/index.js',
  });

  const object = execBundle(result.code);
  const cjs = await object.asyncImportCJS;

  expect(object).toMatchSnapshot();
  expect(cjs).toEqual(expect.objectContaining(cjs.default));

  await expect(object.asyncImportCJS).resolves.toMatchSnapshot();
  await expect(object.asyncImportESM).resolves.toMatchSnapshot();
});
