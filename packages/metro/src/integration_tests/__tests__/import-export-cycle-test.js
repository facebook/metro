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

test('handles import cycles with importAsObjects: true', async () => {
  const bundle = await execTest('import-export-cycle/index.js', {
    experimentalImportSupport: {
      importAsObjects: true,
    },
  });
  expect(bundle).toEqual(
    expect.objectContaining({
      a: 'a',
      b: 'b',
      c: 'c',
      getter: expect.any(Function),
    }),
  );
  expect(bundle.getter()).toEqual({a: 'a', b: 'b', c: 'c'});
});

test('does not handle import cycles by default', async () => {
  const bundle = await execTest('import-export-cycle/index.js');
  expect(bundle).toEqual(
    expect.objectContaining({
      a: 'a',
      b: 'b',
      c: 'c',
      getter: expect.any(Function),
    }),
  );
  expect(bundle.getter()).toEqual({a: undefined, b: undefined, c: undefined});
});

async function buildTest(
  entry,
  {
    experimentalImportSupport,
  }: $ReadOnly<{
    experimentalImportSupport: boolean | $ReadOnly<{importAsObjects: boolean}>,
  }> = {},
) {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });

  const result = await Metro.runBuild(
    {
      ...config,
      transformer: {
        ...config.transformer,
        getTransformOptions: async () => ({
          transform: {
            experimentalImportSupport: experimentalImportSupport ?? true,
            inlineRequires: false,
          },
        }),
      },
    },
    {
      entry,
      dev: false,
      minify: false,
    },
  );

  return result;
}

async function execTest(entry, configOverrides) {
  const result = await buildTest(entry, configOverrides);
  return execBundle(result.code);
}
