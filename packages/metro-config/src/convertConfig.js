/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const TerminalReporter = require('metro/src/lib/TerminalReporter');

const getDefaultConfig = require('./defaults');
const getMaxWorkers = require('metro/src/lib/getMaxWorkers');

const {Terminal} = require('metro-core');

import type {ConfigT, OldConfigT, Middleware} from './configTypes.flow';
import type {TransformVariants} from 'metro/src/ModuleGraph/types.flow.js';
import type Server from 'metro/src/Server';
import type {Reporter} from 'metro/src/lib/reporting';
import type {Options as ServerOptions} from 'metro/src/shared/types.flow';

type DeprecatedMetroOptions = {|
  resetCache?: boolean,
|};

type PublicMetroOptions = {|
  ...DeprecatedMetroOptions,
  config: OldConfigT,
  maxWorkers?: number,
  minifierPath?: string,
  port?: ?number,
  reporter?: Reporter,
|};

type PrivateMetroOptions = {|
  ...PublicMetroOptions,
  watch?: boolean,
|};

// We get the metro runServer signature here and create the new config out of it
async function convertOldToNew({
  config,
  resetCache = false,
  maxWorkers = getMaxWorkers(),
  minifierPath,
  // $FlowFixMe TODO t0 https://github.com/facebook/flow/issues/183
  port = null,
  reporter = new TerminalReporter(new Terminal(process.stdout)),
  watch = false,
}: PrivateMetroOptions): Promise<ConfigT> {
  const {
    getBlacklistRE,
    cacheStores,
    createModuleIdFactory,
    cacheVersion,
    getProjectRoot,
    getWatchFolders,
    getTransformModulePath,
    resolveRequest,
    getAssetExts,
    getPlatforms,
    getProvidesModuleNodeModules,
    getResolverMainFields,
    getSourceExts,
    hasteImplModulePath,
    assetTransforms,
    dynamicDepsInPackages,
    getPolyfillModuleNames,
    getAsyncRequireModulePath,
    getRunModuleStatement,
    getPolyfills,
    postProcessBundleSourcemap,
    getModulesRunBeforeMainModule,
    getUseGlobalHotkey,
    enhanceMiddleware,
    assetRegistryPath,
    getEnableBabelRCLookup,
    getTransformOptions,
    postMinifyProcess,
    getWorkerPath,
    extraNodeModules,
    transformVariants,
    processModuleFilter,
  } = config;

  const defaultConfig = await getDefaultConfig(getProjectRoot());

  const assetExts = defaultConfig.resolver.assetExts.concat(
    (getAssetExts && getAssetExts()) || [],
  );
  const sourceExts = defaultConfig.resolver.sourceExts.concat(
    (getSourceExts && getSourceExts()) || [],
  );
  const platforms =
    (getPlatforms && getPlatforms()) || defaultConfig.resolver.platforms;

  const providesModuleNodeModules =
    typeof getProvidesModuleNodeModules === 'function'
      ? getProvidesModuleNodeModules()
      : defaultConfig.resolver.providesModuleNodeModules;

  const watchFolders = [getProjectRoot(), ...getWatchFolders()];

  return {
    resolver: {
      assetExts,
      platforms,
      providesModuleNodeModules,
      resolverMainFields: getResolverMainFields(),
      sourceExts,
      hasteImplModulePath,
      assetTransforms:
        assetTransforms || defaultConfig.resolver.assetTransforms,
      extraNodeModules,
      resolveRequest,
      blacklistRE: getBlacklistRE()
        ? getBlacklistRE()
        : defaultConfig.resolver.blacklistRE,
      useWatchman: true,
    },
    serializer: {
      createModuleIdFactory:
        createModuleIdFactory || defaultConfig.serializer.createModuleIdFactory,
      polyfillModuleNames: getPolyfillModuleNames(),
      getRunModuleStatement,
      getPolyfills,
      postProcessBundleSourcemap,
      processModuleFilter:
        processModuleFilter || defaultConfig.serializer.processModuleFilter,
      getModulesRunBeforeMainModule,
      experimentalSerializerHook: () => {},
    },
    server: {
      useGlobalHotkey: getUseGlobalHotkey(),
      port,
      enhanceMiddleware,
    },
    transformer: {
      assetPlugins: defaultConfig.transformer.assetPlugins,
      assetRegistryPath,
      asyncRequireModulePath: getAsyncRequireModulePath(),
      babelTransformerPath: getTransformModulePath(),
      dynamicDepsInPackages,
      enableBabelRCLookup: getEnableBabelRCLookup(),
      getTransformOptions,
      minifierPath: minifierPath || defaultConfig.transformer.minifierPath,
      optimizationSizeLimit: 150 * 1024, // 150 KiB enforced for old configs.
      postMinifyProcess,
      transformVariants: transformVariants
        ? transformVariants()
        : defaultConfig.transformer.transformVariants,
      workerPath: getWorkerPath(),
    },

    reporter,
    cacheStores,
    cacheVersion,
    projectRoot: getProjectRoot(),
    watchFolders,
    transformerPath: defaultConfig.transformerPath,
    resetCache,
    watch,
    maxWorkers,
  };
}

export type ConvertedOldConfigT = {
  serverOptions: ServerOptions,
  extraOptions: {
    enhanceMiddleware: (Middleware, Server) => Middleware,
    port: number,
    getUseGlobalHotkey: () => boolean,
    transformVariants: () => TransformVariants,
  },
};

/**
 * Convert the new config format to the old config format which Metro understands.
 * Over time we will change Metro to understand the new configuration, when we're
 * there we can remove this function.
 */
function convertNewToOld(newConfig: ConfigT): ConvertedOldConfigT {
  const {
    resolver = {},
    serializer = {},
    server = {},
    transformer = {},
    reporter,
    cacheStores,
    cacheVersion,
    projectRoot,
    watchFolders,
    resetCache,
    watch,
    maxWorkers,
  } = newConfig;

  const {
    assetExts,
    platforms,
    providesModuleNodeModules,
    resolverMainFields,
    sourceExts,
    hasteImplModulePath,
    assetTransforms,
    extraNodeModules,
    resolveRequest,
    blacklistRE,
  } = resolver;

  const {
    polyfillModuleNames,
    getRunModuleStatement,
    getPolyfills,
    postProcessBundleSourcemap,
    getModulesRunBeforeMainModule,
    createModuleIdFactory,
    processModuleFilter,
  } = serializer;

  const {useGlobalHotkey, port, enhanceMiddleware} = server;

  const {
    assetRegistryPath,
    babelTransformerPath,
    enableBabelRCLookup,
    dynamicDepsInPackages,
    getTransformOptions,
    postMinifyProcess,
    workerPath,
    minifierPath,
    transformVariants,
    asyncRequireModulePath,
  } = transformer;

  // Return old config
  const oldConfig: $Shape<ConvertedOldConfigT> = {
    serverOptions: {
      assetExts: assetTransforms ? [] : assetExts,
      assetRegistryPath,
      assetTransforms,
      asyncRequireModulePath,
      platforms,
      providesModuleNodeModules,
      getResolverMainFields: () => resolverMainFields,
      sourceExts: assetTransforms ? sourceExts.concat(assetExts) : sourceExts,
      dynamicDepsInPackages,
      polyfillModuleNames,
      extraNodeModules,
      getRunModuleStatement,
      getPolyfills,
      postProcessBundleSourcemap,
      getModulesRunBeforeMainModule,
      enableBabelRCLookup,
      getTransformOptions,
      postMinifyProcess,
      workerPath,
      minifierPath,
      cacheStores,
      cacheVersion,
      projectRoot,
      watchFolders,
      transformModulePath: babelTransformerPath,
      resolveRequest,
      resetCache,
      watch,
      reporter,
      maxWorkers,

      createModuleIdFactory,
      hasteImplModulePath,
    },
    extraOptions: {
      enhanceMiddleware,
      getUseGlobalHotkey: () => useGlobalHotkey,
      port,
      processModuleFilter,
      transformVariants: () => transformVariants,
    },
  };

  if (blacklistRE) {
    oldConfig.serverOptions.blacklistRE = blacklistRE;
  }

  return oldConfig;
}

module.exports = {
  convertNewToOld,
  convertOldToNew,
};
