/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const transformHelpers = require('../lib/transformHelpers');

import type {WorkerOptions} from '../JSTransformer/worker';

async function getTransformOptions(): Promise<WorkerOptions> {
  const bundler = {
    getGlobalTransformOptions() {
      return {
        enableBabelRCLookup: true,
        projectRoot: '/root',
      };
    },
    async getTransformOptionsForEntryFiles() {
      return {
        inlineRequires: true,
      };
    },
  };

  return await transformHelpers.calcTransformerOptions(
    [],
    bundler,
    {},
    {
      assetPlugins: [],
      dev: true,
      entryPoints: [],
      hot: true,
      minify: false,
      platform: 'ios',
      type: 'module',
    },
  );
}

module.exports = getTransformOptions;
