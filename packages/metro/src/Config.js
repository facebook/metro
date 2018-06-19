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

const blacklist = require('./blacklist');
const os = require('os');
const path = require('path');

const {providesModuleNodeModules} = require('./defaults');
const {FileStore} = require('metro-cache');

import type {
  GetTransformOptions,
  PostMinifyProcess,
  PostProcessBundleSourcemap,
} from './Bundler';
import type {TransformResult} from './DeltaBundler';
import type {DynamicRequiresBehavior} from './ModuleGraph/worker/collectDependencies';
import type {IncomingMessage, ServerResponse} from 'http';
import type {CacheStore} from 'metro-cache';
import type {CustomResolver} from 'metro-resolver';

type Middleware = (IncomingMessage, ServerResponse, ?() => mixed) => mixed;

export type ConfigT = {
  // TODO: Remove this option below (T23793920)
  assetTransforms?: boolean,

  assetRegistryPath: string,

  /**
   * List of all store caches.
   */
  cacheStores: Array<CacheStore<TransformResult<>>>,

  /**
   * Can be used to generate a key that will invalidate the whole metro cache
   * (for example a global dependency version used by the transformer).
   */
  cacheVersion: string,

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

  /**
   * Returns a regular expression for modules that should be ignored by the
   * packager on a given platform.
   */
  getBlacklistRE(): RegExp,

  /**
   * Specify an implementation module to load async import modules (for
   * splitting).
   */
  getAsyncRequireModulePath(): string,

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

  /**
   * Specify a list of project roots
   * @deprecated Previousely used to set up a list of watchers (one per
   * directory). Discontinued in a favor of getProjectRoot and getWatchFolders
   */
  getProjectRoots: ?() => Array<string>,

  /**
   * Specify a root folder of the user project
   */
  getProjectRoot: () => string,

  /**
   * Specify any additional (to projectRoot) watch folders
   */
  getWatchFolders: () => Array<string>,

  /**
   * Specify any additional node modules that should be processed for
   * providesModule declarations.
   */
  getProvidesModuleNodeModules?: () => Array<string>,

  /**
   * Specify the fields in package.json files that will be used by the module
   * resolver to do redirections when requiring certain packages. For example,
   * using `['browser', 'main']` will use the `browser` field if it exists and
   * will default to `main` if it doesn't.
   */
  getResolverMainFields: () => $ReadOnlyArray<string>,

  /**
   * Specify the format of the initial require statements that are appended
   * at the end of the bundle. By default is `require(${moduleId});`
   */
  getRunModuleStatement: (number | string) => string,

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
   * An optional function that can modify the code and source map of the bundle
   * before it is written. Applied once for the entire bundle, only works if
   * output is a plainBundle.
   */
  postProcessBundleSourcemap: PostProcessBundleSourcemap,

  /**
   * An optional function used to resolve requests. Ignored when the request can
   * be resolved through Haste.
   */
  resolveRequest: ?CustomResolver,

  /**
   * Path to a require-able module that exports:
   * - a `getHasteName(filePath)` method that returns `hasteName` for module at
   *  `filePath`, or undefined if `filePath` is not a haste module.
   */
  hasteImplModulePath?: string,

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
  cacheStores: [
    new FileStore({
      root: path.join(os.tmpdir(), 'metro-cache'),
    }),
  ],
  cacheVersion: '1.0',
  dynamicDepsInPackages: 'throwAtRuntime',
  getAsyncRequireModulePath: () => 'metro/src/lib/bundle-modules/asyncRequire',
  getAssetExts: () => [],
  getBlacklistRE: () => blacklist(),
  getEnableBabelRCLookup: () => true,
  getPlatforms: () => [],
  getPolyfillModuleNames: () => [],
  getProjectRoots: undefined,
  // We assume the default project path is two levels up from
  // node_modules/metro/
  getProjectRoot: () => path.resolve(__dirname, '../../..'),
  getWatchFolders: () => [],
  getProvidesModuleNodeModules: () => providesModuleNodeModules.slice(),
  getRunModuleStatement: (moduleId: number | string) =>
    `require(${JSON.stringify(moduleId)});`,
  getSourceExts: () => [],
  getTransformModulePath: () => require.resolve('./defaultTransformer'),
  getTransformOptions: async () => ({}),
  getPolyfills: () => [],
  getUseGlobalHotkey: () => true,
  postMinifyProcess: x => x,
  postProcessBundleSourcemap: ({code, map, outFileName}) => ({code, map}),
  resolveRequest: null,
  getResolverMainFields: () => ['browser', 'main'],
  getModulesRunBeforeMainModule: () => [],
  getWorkerPath: () => null,
}: ConfigT);

const normalize = (initialConfig: ConfigT, defaults?: ConfigT): ConfigT => {
  const normalizedConfig: ConfigT = {
    ...(defaults || DEFAULT),
    ...initialConfig,
  };

  const watchFolders = normalizedConfig.getWatchFolders();
  const projectRoot = normalizedConfig.getProjectRoot();

  // TODO: Remove me once getProjectRoots is finally deprecated
  if (normalizedConfig.getProjectRoots) {
    const legacyProjectRoots = normalizedConfig.getProjectRoots();
    normalizedConfig.getProjectRoot = () => legacyProjectRoots[0];
    normalizedConfig.getWatchFolders = () => legacyProjectRoots;
    normalizedConfig.getProjectRoots = undefined;

    console.warn(
      'Warning! Your metro configuration contains a deprecated function ' +
        '"projectRoots". Please, consider changing it to "getProjectRoot" ' +
        'with "watchFolders" (if needed)',
    );
  } else if (watchFolders.includes(projectRoot)) {
    console.warn(
      'Warning! There is no need to specify your projectRoot (' +
        projectRoot +
        ') in "watchFolders". It will be watched automatically',
    );
  } else {
    normalizedConfig.getWatchFolders = () => [projectRoot, ...watchFolders];
  }

  return normalizedConfig;
};

const load = (configFile: string, defaults?: ConfigT) =>
  // $FlowFixMe dynamic require
  normalize(require(configFile), defaults);

module.exports = {
  DEFAULT,
  load,
  normalize,
};
