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

const DeltaCalculator = require('../DeltaBundler/DeltaCalculator');

import type {Options as JSTransformerOptions} from '../JSTransformer/worker';

async function getTransformOptions(): Promise<JSTransformerOptions> {
  const bundler = {
    getGlobalTransformOptions() {
      return {
        enableBabelRCLookup: true,
        projectRoot: '/root',
      };
    },
    async getTransformOptionsForEntryFile() {
      return {
        inlineRequires: true,
      };
    },
  };
  const dependencyGraph = {
    getWatcher() {
      return {on() {}};
    },
  };
  const options = {
    assetPlugins: [],
    dev: true,
    hot: true,
    minify: false,
    platform: 'ios',
  };

  const deltaCalculator = new DeltaCalculator(
    bundler,
    dependencyGraph,
    options,
  );

  return await deltaCalculator.getTransformerOptions();
}

module.exports = getTransformOptions;
