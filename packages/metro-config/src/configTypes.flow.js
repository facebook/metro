/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

'use strict';

import type {BabelSourceMap} from '@babel/core';
import type {IncomingMessage, ServerResponse} from 'http';
import type {CacheStore} from 'metro-cache';
import type {CustomResolver} from 'metro-resolver';
import type {MetroSourceMap} from 'metro-source-map';
import type {
  DeltaResult,
  Graph,
  Module,
} from 'metro/src/DeltaBundler/types.flow.js';
import type {TransformResult} from 'metro/src/DeltaBundler';
import type {TransformVariants} from 'metro/src/ModuleGraph/types.flow.js';
import type {DynamicRequiresBehavior} from 'metro/src/ModuleGraph/worker/collectDependencies';
import type Server from 'metro/src/Server';
import type {Reporter} from 'metro/src/lib/reporting';

export type PostMinifyProcess = ({
  code: string,
  map: ?BabelSourceMap,
}) => {code: string, map: ?BabelSourceMap};

export type PostProcessBundleSourcemap = ({
  code: Buffer | string,
  map: MetroSourceMap,
  outFileName: string,
}) => {code: Buffer | string, map: MetroSourceMap | string};

type ExtraTransformOptions = {
  +preloadedModules: {[path: string]: true} | false,
  +ramGroups: Array<string>,
  +transform: {|
    +experimentalImportSupport: boolean,
    +inlineRequires: {+blacklist: {[string]: true}} | boolean,
  |},
};

export type GetTransformOptionsOpts = {|
  dev: boolean,
  hot: boolean,
  platform: ?string,
|};

export type GetTransformOptions = (
  entryPoints: $ReadOnlyArray<string>,
  options: GetTransformOptionsOpts,
  getDependenciesOf: (string) => Promise<Array<string>>,
) => Promise<ExtraTransformOptions>;

export type Middleware = (
  IncomingMessage,
  ServerResponse,
  ?() => mixed,
) => mixed;

export type OldConfigT = {
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
  enhanceMiddleware: (Middleware, Server) => Middleware,

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

  processModuleFilter: (modules: Module<>) => boolean,

  transformVariants?: () => TransformVariants,
};

export type InputConfigT = $ReadOnly<{
  resolver?: $ReadOnly<{
    /**
     * Returns a regular expression for modules that should be ignored by the
     * packager on a given platform.
     */
    blacklistRE?: RegExp,
    /**
     * Specify any additional asset file extensions to be used by the packager.
     * For example, if you want to include a .ttf file, you would return ['ttf']
     * from here and use `require('./fonts/example.ttf')` inside your app.
     */
    assetExts?: Array<string>,

    /**
     * Specify any additional platforms to be used by the packager.
     * For example, if you want to add a "custom" platform, and use modules
     * ending in .custom.js, you would return ['custom'] here.
     */
    platforms?: Array<string>,

    /**
     * Specify any additional node modules that should be processed for
     * providesModule declarations.
     */
    providesModuleNodeModules?: Array<string>,

    /**
     * Specify the fields in package.json files that will be used by the module
     * resolver to do redirections when requiring certain packages. For example,
     * using `['browser', 'main']` will use the `browser` field if it exists and
     * will default to `main` if it doesn't.
     */
    resolverMainFields?: $ReadOnlyArray<string>,

    /**
     * Specify any additional source file extensions to be used by the packager.
     * For example, if you want to include a .ts file, you would return ['ts']
     * from here and use `require('./module/example')` to require the file with
     * path 'module/example.ts' inside your app.
     */
    sourceExts?: Array<string>,

    /**
     * Path to a require-able module that exports:
     * - a `getHasteName(filePath)` method that returns `hasteName` for module at
     *  `filePath`, or undefined if `filePath` is not a haste module.
     */
    hasteImplModulePath?: string,

    /**
     * This property specifies if we want to merge the `sourceExts` with the
     * `assetExts`. We should deprecate this property.
     */
    assetTransforms?: boolean,

    extraNodeModules?: {[name: string]: string},

    /**
     * An optional function used to resolve requests. Ignored when the request can
     * be resolved through Haste.
     */
    resolveRequest?: ?CustomResolver,

    /**
     * If false, Metro will avoid using watchman even if it's available on the
     * system.
     */
    useWatchman?: boolean,
  }>,
  server?: $ReadOnly<{
    useGlobalHotkey?: boolean,
    port?: ?number,
    enhanceMiddleware?: (Middleware, Server) => Middleware,
    enableVisualizer?: boolean,
  }>,
  serializer?: $ReadOnly<{
    /**
     * An optional custom module ID factory creator used by the bundler.
     */
    createModuleIdFactory?: () => (path: string) => number,

    /**
     * Specify any additional polyfill modules that should be processed
     * before regular module loading.
     */
    polyfillModuleNames?: Array<string>, // This one is not sure

    /**
     * Specify the format of the initial require statements that are appended
     * at the end of the bundle. By default is `require(${moduleId});`
     */
    getRunModuleStatement?: (number | string) => string,

    /**
     * An optional list of polyfills to include in the bundle. The list defaults
     * to a set of common polyfills for Number, String, Array, Object...
     */
    getPolyfills?: ({platform: ?string}) => $ReadOnlyArray<string>,

    /**
     * An optional function that can modify the code and source map of the bundle
     * before it is written. Applied once for the entire bundle, only works if
     * output is a plainBundle.
     */
    postProcessBundleSourcemap?: PostProcessBundleSourcemap,

    /**
     * An array of modules to be required before the entry point. It should
     * contain the absolute path of each module.
     */
    getModulesRunBeforeMainModule?: (entryFilePath: string) => Array<string>,

    /**
     * Do not use yet, since the Graph API is going to change soon.
     */
    experimentalSerializerHook?: (
      graph: Graph<>,
      delta: DeltaResult<>,
    ) => mixed,
  }>,
  transformer?: $ReadOnly<{
    assetRegistryPath?: string,
    /**
     * Specify whether or not to enable Babel's behavior for looking up .babelrc
     * files. If false, only the .babelrc file (if one exists) in the main project
     * root is used.
     */
    enableBabelRCLookup?: boolean,

    dynamicDepsInPackages?: DynamicRequiresBehavior,

    getTransformOptions?: GetTransformOptions,

    /**
     * Specify an implementation module to load async import modules (for
     * splitting).
     */
    asyncRequireModulePath?: string,

    /**
     * An optional function that can modify the code and source map of bundle
     * after the minifaction took place. (Function applied per module).
     */
    postMinifyProcess?: PostMinifyProcess,

    /**
     * The path to the worker that is used for transformation.
     */
    workerPath?: ?string,

    minifierPath?: string,

    transformVariants?: TransformVariants,
  }>,

  // Metal

  /**
   * List of all store caches.
   */
  cacheStores?: $ReadOnlyArray<CacheStore<TransformResult<>>>,

  /**
   * Can be used to generate a key that will invalidate the whole metro cache
   * (for example a global dependency version used by the transformer).
   */
  cacheVersion?: string, // Do we need this?

  /**
   * Specify a root folder of the user project
   */
  projectRoot?: string,

  /**
   * Specify any additional (to projectRoot) watch folders
   */
  watchFolders?: Array<string>,

  /**
   * Returns the path to a custom transformer. This can also be overridden
   * with the --transformer commandline argument.
   */
  transformerPath?: string,

  /**
   * Whether we should watch for all files
   */
  watch?: boolean,

  reporter?: Reporter,

  resetCache?: boolean,

  maxWorkers?: number,
}>;

export type IntermediateConfigT = {
  resolver: {
    assetExts: Array<string>,
    platforms: Array<string>,
    providesModuleNodeModules: Array<string>,
    resolverMainFields: $ReadOnlyArray<string>,
    sourceExts: Array<string>,
    hasteImplModulePath?: string,
    assetTransforms: boolean,
    extraNodeModules: {[name: string]: string},
    resolveRequest?: ?CustomResolver,
    blacklistRE: RegExp,
    useWatchman: boolean,
  },
  server: {
    useGlobalHotkey: boolean,
    port: number,
    enhanceMiddleware: (Middleware, Server) => Middleware,
    enableVisualizer?: boolean,
  },
  serializer: {
    polyfillModuleNames: Array<string>, // This one is not sure
    getRunModuleStatement: (number | string) => string,
    getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
    postProcessBundleSourcemap: PostProcessBundleSourcemap,
    getModulesRunBeforeMainModule: (entryFilePath: string) => Array<string>,
    processModuleFilter: (modules: Module<>) => boolean,
    createModuleIdFactory: () => (path: string) => number,
    experimentalSerializerHook: (graph: Graph<>, delta: DeltaResult<>) => mixed,
  },
  transformer: {
    assetPlugins: Array<string>,
    assetRegistryPath: string,
    asyncRequireModulePath: string,
    babelTransformerPath: string,
    enableBabelRCLookup: boolean,
    dynamicDepsInPackages: DynamicRequiresBehavior,
    getTransformOptions: GetTransformOptions,
    minifierPath: string,
    optimizationSizeLimit: number,
    postMinifyProcess: PostMinifyProcess,
    transformVariants: TransformVariants,
    workerPath: ?string,
  },

  // Metal

  cacheStores: $ReadOnlyArray<CacheStore<TransformResult<>>>,
  cacheVersion: string, // Do we need this?
  projectRoot: string,
  transformerPath: string,
  watchFolders: Array<string>,
  watch: boolean,
  reporter: Reporter,
  resetCache: boolean,
  maxWorkers: number,
};

// Will become `export type ConfigT = $ReadOnly<IntermediateConfigT>;`
// in the future when we converted all configuration
export type ConfigT = IntermediateConfigT;
