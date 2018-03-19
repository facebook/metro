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

import type Bundler from '../Bundler';
import type {DependencyEdge} from '../DeltaBundler/traverseDependencies';
import type Module from '../node-haste/Module';

type Options = {
  enableBabelRCLookup: boolean,
  getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  polyfillModuleNames: Array<string>,
  projectRoots: $ReadOnlyArray<string>,
};

type BundleOptions = {
  +dev: boolean,
  +hot: boolean,
  +platform: ?string,
};

async function getPrependedScripts(
  options: Options,
  bundleOptions: BundleOptions,
  bundler: Bundler,
): Promise<Array<DependencyEdge>> {
  // Get all the polyfills from the relevant option params (the
  // `getPolyfills()` method and the `polyfillModuleNames` variable).
  const polyfillModuleNames = options
    .getPolyfills({
      platform: bundleOptions.platform,
    })
    .concat(options.polyfillModuleNames);

  const dependencyGraph = await bundler.getDependencyGraph();

  // Build the module system dependencies (scripts that need to
  // be included at the very beginning of the bundle) + any polifyll.
  const modules = [defaults.moduleSystem]
    .concat(polyfillModuleNames)
    .map(polyfillModuleName =>
      dependencyGraph.createPolyfill({
        file: polyfillModuleName,
      }),
    );

  const transformOptions = {
    dev: bundleOptions.dev,
    enableBabelRCLookup: options.enableBabelRCLookup,
    hot: bundleOptions.hot,
    projectRoot: options.projectRoots[0],
  };

  const out = await Promise.all(
    modules.map(module => _createEdgeFromScript(module, transformOptions)),
  );

  out.unshift(_getPrelude({dev: bundleOptions.dev}));

  return out;
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

async function _createEdgeFromScript(
  module: Module,
  options: {
    dev: boolean,
    enableBabelRCLookup: boolean,
    hot: boolean,
    projectRoot: string,
  },
): Promise<DependencyEdge> {
  const result = await module.read({
    assetDataPlugins: [],
    customTransformOptions: {},
    dev: options.dev,
    enableBabelRCLookup: options.enableBabelRCLookup,
    hot: options.hot,
    inlineRequires: false,
    minify: false,
    platform: undefined,
    projectRoot: options.projectRoot,
  });

  return {
    dependencies: new Map(),
    inverseDependencies: new Set(),
    path: module.path,
    output: {
      code: result.code,
      map: result.map,
      source: result.source,
      type: 'script',
    },
  };
}

module.exports = getPrependedScripts;
