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

const {calcTransformerOptions} = require('../transformHelpers');

describe('calcTransformerOptions', () => {
  const entryFiles = [];
  const bundler = {};
  const deltaBundler = {};
  const options = {};

  it('returns `unstable_disableModuleWrapping: false` by default', async () => {
    const transformOptions = await calcTransformerOptions(
      entryFiles,
      bundler,
      deltaBundler,
      {
        transformer: {
          getTransformOptions: async () => ({
            transform: {},
          }),
        },
      },
      options,
    );
    expect(transformOptions.unstable_disableModuleWrapping).toBe(false);
  });

  it('returns `unstable_disableModuleWrapping`', async () => {
    const transformOptions = await calcTransformerOptions(
      entryFiles,
      bundler,
      deltaBundler,
      {
        transformer: {
          getTransformOptions: async () => ({
            transform: {
              unstable_disableModuleWrapping: true,
            },
          }),
        },
      },
      options,
    );
    expect(transformOptions.unstable_disableModuleWrapping).toBe(true);
  });
});
