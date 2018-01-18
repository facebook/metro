/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */
'use strict';

const blacklist = require('./blacklist');
const path = require('path');

const {providesModuleNodeModules} = require('./defaults');

import type {
  GetTransformOptions,
  PostMinifyProcess,
  PostProcessBundleSourcemap,
} from './Bundler';
import type {PostProcessModules} from './DeltaBundler';
import type {PostProcessModules as PostProcessModulesForBuck} from './ModuleGraph/types.flow.js';
import type {TransformVariants} from './ModuleGraph/types.flow';
import type {DynamicRequiresBehavior} from './ModuleGraph/worker/collectDependencies';
import type {HasteImpl} from './node-haste/Module';
import type {IncomingMessage, ServerResponse} from 'http';

type Middleware = (IncomingMessage, ServerResponse, ?() => mixed) => mixed;

export type ConfigT = {
  assetRegistryPath: string,

  /**
   * Called with the Metro middleware in parameter; can be used to wrap this
   * middleware inside another one
   */
  enhanceMiddleware: Middleware => Middleware,

  extraNodeModules: {[id: string]: string},

  +dynamicDepsInPackages: DynamicRequiresBehavior,

  /**
   * Specify any additional asset file extensions to be used by the packager.
   * For example, if you want to include a .ttf file, you would return ['ttf']
   * from here and use `require('./fonts/example.ttf')` inside your app.
   */
  getAssetExts: () => Array<string>,
  // TODO: Remove this option below (T23793920)
  assetTransforms?: boolean,
  /**
   * Returns a regular expression for modules that should be ignored by the
   * packager on a given platform.
   */
  getBlacklistRE(): RegExp,

  /**
   * Specify whether or not to enable Babel's behavior for looking up .babelrc
   * files. If false, only the .babelrc file (if one exists) in the main project
   * root is used.
   */
  getEnableBabelRCLookup(): boolean,

  /**
   * Specify any additional polyfill modules that should be processed
   * before regular module loading.
   */
  getPolyfillModuleNames: () => Array<string>,

  /**
   * Specify any additional platforms to be used by the packager.
   * For example, if you want to add a "custom" platform, and use modules
   * ending in .custom.js, you would return ['custom'] here.
   */
  getPlatforms: () => Array<string>,

  getProjectRoots(): Array<string>,

  /**
   * Specify any additional node modules that should be processed for
   * providesModule declarations.
   */
  getProvidesModuleNodeModules?: () => Array<string>,

  /**
   * Specify any additional source file extensions to be used by the packager.
   * For example, if you want to include a .ts file, you would return ['ts']
   * from here and use `require('./module/example')` to require the file with
   * path 'module/example.ts' inside your app.
   */
  getSourceExts: () => Array<string>,

  /**
   * Returns the path to a custom transformer. This can also be overridden
   * with the --transformer commandline argument.
   */
  getTransformModulePath: () => string,
  getTransformOptions: GetTransformOptions,

  /**
   * Returns the path to the worker that is used for transformation.
   */
  getWorkerPath: () => ?string,

  /**
   * An optional list of polyfills to include in the bundle. The list defaults
   * to a set of common polyfills for Number, String, Array, Object...
   */
  getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,

  getUseGlobalHotkey: () => boolean,

  /**
   * An optional function that can modify the code and source map of bundle
   * after the minifaction took place. (Function applied per module).
   */
  postMinifyProcess: PostMinifyProcess,

  /**
   * An optional function that can modify the module array before the bundle is
   * finalized.
   */
  postProcessModules: PostProcessModules,

  /**
   * An optional function that can modify the code and source map of the bundle
   * before it is written. Applied once for the entire bundle, only works if
   * output is a plainBundle.
   */
  postProcessBundleSourcemap: PostProcessBundleSourcemap,

  /**
   * Same as `postProcessModules` but for the Buck worker. Eventually we do want
   * to unify both variants.
   */
  postProcessModulesForBuck: PostProcessModulesForBuck,

  /**
   * A module that exports:
   * - a `getHasteName(filePath)` method that returns `hasteName` for module at
   *  `filePath`, or undefined if `filePath` is not a haste module.
   */
  hasteImpl?: HasteImpl,

  transformVariants: () => TransformVariants,

  /**
   * An array of modules to be required before the entry point. It should
   * contain the absolute path of each module.
   */
  getModulesRunBeforeMainModule: (entryFilePath: string) => Array<string>,

  /**
   * An optional custom module ID factory creator used by the bundler.
   */
  createModuleIdFactory?: () => (path: string) => number,
};

const DEFAULT = ({
  assetRegistryPath: 'missing-asset-registry-path',
  enhanceMiddleware: middleware => middleware,
  extraNodeModules: {},
  assetTransforms: false,
  dynamicDepsInPackages: 'throwAtRuntime',
  getAssetExts: () => [],
  getBlacklistRE: () => blacklist(),
  getEnableBabelRCLookup: () => false,
  getPlatforms: () => [],
  getPolyfillModuleNames: () => [],
  // We assume the default project path is two levels up from
  // node_modules/metro/
  getProjectRoots: () => [path.resolve(__dirname, '../..')],
  getProvidesModuleNodeModules: () => providesModuleNodeModules.slice(),
  getSourceExts: () => [],
  getTransformModulePath: () => require.resolve('./transformer.js'),
  getTransformOptions: async () => ({}),
  getPolyfills: () => [],
  getUseGlobalHotkey: () => true,
  postMinifyProcess: x => x,
  postProcessModules: modules => modules,
  postProcessModulesForBuck: modules => modules,
  postProcessBundleSourcemap: ({code, map, outFileName}) => ({code, map}),
  getModulesRunBeforeMainModule: () => [],
  transformVariants: () => ({default: {}}),
  getWorkerPath: () => null,
}: ConfigT);

const normalize = (initialConfig: ConfigT, defaults?: ConfigT): ConfigT => {
  return {
    ...(defaults || DEFAULT),
    ...initialConfig,
  };
};

const load = (configFile: string, defaults?: ConfigT) =>
  // $FlowFixMe dynamic require
  normalize(require(configFile), defaults);

module.exports = {
  DEFAULT,
  load,
  normalize,
};
