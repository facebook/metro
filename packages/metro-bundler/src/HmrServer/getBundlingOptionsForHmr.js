/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @flow
 */

'use strict';

import type {Options as BundleOptions} from '../DeltaBundler';

/**
 * Module to easily create the needed configuration parameters needed for the
 * bundler for HMR (since a lot of params are not relevant in this use case).
 */
module.exports = function getBundlingOptionsForHmr(
  entryFile: string,
  platform: string,
): BundleOptions {
  // These are the really meaningful bundling options. The others below are
  // not relevant for HMR.
  const mainOptions = {
    deltaBundleId: null,
    entryFile,
    hot: true,
    minify: false,
    platform,
    wrapModules: false,
  };

  return {
    ...mainOptions,
    assetPlugins: [],
    dev: true,
    entryModuleOnly: false,
    excludeSource: false,
    generateSourceMaps: false,
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
