/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const defaults = require('metro-config/src/defaults/defaults');
const getPreludeCode = require('./getPreludeCode');
const transformHelpers = require('./transformHelpers');

import type Bundler from '../Bundler';
import type DeltaBundler, {Module} from '../DeltaBundler';
import type {CustomTransformOptions} from '../JSTransformer/worker';
import type {ConfigT} from 'metro-config/src/configTypes.flow';

type BundleOptions = {
  customTransformOptions: CustomTransformOptions,
  +dev: boolean,
  +hot: boolean,
  +minify: boolean,
  +platform: ?string,
};

async function getPrependedScripts(
  config: ConfigT,
  bundleOptions: BundleOptions,
  bundler: Bundler,
  deltaBundler: DeltaBundler<>,
): Promise<$ReadOnlyArray<Module<>>> {
  // Get all the polyfills from the relevant option params (the
  // `getPolyfills()` method and the `polyfillModuleNames` variable).
  const polyfillModuleNames = config.serializer
    .getPolyfills({
      platform: bundleOptions.platform,
    })
    .concat(config.serializer.polyfillModuleNames);

  const buildOptions = {
    customTransformOptions: bundleOptions.customTransformOptions,
    dev: bundleOptions.dev,
    hot: bundleOptions.hot,
    minify: bundleOptions.minify,
    platform: bundleOptions.platform,
    type: 'script',
  };

  const graph = await deltaBundler.buildGraph(
    [defaults.moduleSystem, ...polyfillModuleNames],
    {
      resolve: await transformHelpers.getResolveDependencyFn(
        bundler,
        buildOptions.platform,
      ),
      transform: await transformHelpers.getTransformFn(
        [defaults.moduleSystem, ...polyfillModuleNames],
        bundler,
        deltaBundler,
        config,
        buildOptions,
      ),
      onProgress: null,
    },
  );

  return [
    _getPrelude({dev: bundleOptions.dev}),
    ...graph.dependencies.values(),
  ];
}

function _getPrelude({dev}: {dev: boolean}): Module<> {
  const code = getPreludeCode({isDev: dev});
  const name = '__prelude__';

  return {
    dependencies: new Map(),
    getSource: () => Buffer.from(code),
    inverseDependencies: new Set(),
    path: name,
    output: [
      {
        type: 'js/script/virtual',
        data: {
          code,
          map: [],
        },
      },
    ],
  };
}

module.exports = getPrependedScripts;
