/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const defaults = require('../defaults');
const getPreludeCode = require('./getPreludeCode');

import type {DependencyEdge} from '../DeltaBundler/traverseDependencies';
import type DeltaBundler from '../DeltaBundler';
import type {CustomTransformOptions} from '../JSTransformer/worker';

type Options = {
  getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  polyfillModuleNames: Array<string>,
};

type BundleOptions = {
  customTransformOptions: CustomTransformOptions,
  +dev: boolean,
  +hot: boolean,
  +minify: boolean,
  +platform: ?string,
};

async function getPrependedScripts(
  options: Options,
  bundleOptions: BundleOptions,
  deltaBundler: DeltaBundler,
): Promise<Array<DependencyEdge>> {
  // Get all the polyfills from the relevant option params (the
  // `getPolyfills()` method and the `polyfillModuleNames` variable).
  const polyfillModuleNames = options
    .getPolyfills({
      platform: bundleOptions.platform,
    })
    .concat(options.polyfillModuleNames);

  const graph = await deltaBundler.buildGraph({
    assetPlugins: [],
    customTransformOptions: bundleOptions.customTransformOptions,
    dev: bundleOptions.dev,
    entryPoints: [defaults.moduleSystem, ...polyfillModuleNames],
    hot: bundleOptions.hot,
    minify: bundleOptions.minify,
    onProgress: null,
    platform: bundleOptions.platform,
    type: 'script',
  });

  return [
    _getPrelude({dev: bundleOptions.dev}),
    ...graph.dependencies.values(),
  ];
}

function _getPrelude({dev}: {dev: boolean}): DependencyEdge {
  const code = getPreludeCode({isDev: dev});
  const name = '__prelude__';

  return {
    dependencies: new Map(),
    inverseDependencies: new Set(),
    path: name,
    output: {
      code,
      map: [],
      source: code,
      type: 'script',
    },
  };
}

module.exports = getPrependedScripts;
