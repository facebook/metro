/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

import type {CustomTransformOptions} from '../JSTransformer/worker';
import type {BundleOptions} from '../shared/types.flow';

/**
 * Module to easily create the needed configuration parameters needed for the
 * bundler for HMR (since a lot of params are not relevant in this use case).
 */
module.exports = function getBundlingOptionsForHmr(
  entryFile: string,
  platform: string,
  customTransformOptions: CustomTransformOptions,
): BundleOptions {
  // These are the really meaningful bundling options. The others below are
  // not relevant for HMR.
  const mainOptions = {
    deltaBundleId: null,
    entryFile,
    hot: true,
    minify: false,
    platform,
  };

  return {
    ...mainOptions,
    assetPlugins: [],
    bundleType: 'hmr',
    customTransformOptions,
    dev: true,
    entryModuleOnly: false,
    excludeSource: false,
    inlineSourceMap: false,
    isolateModuleIDs: false,
    onProgress: null,
    resolutionResponse: null,
    runBeforeMainModule: [],
    runModule: false,
    sourceMapUrl: '',
    unbundle: false,
  };
};
