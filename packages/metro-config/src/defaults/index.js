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

const blacklist = require('./blacklist');
const getMaxWorkers = require('metro/src/lib/getMaxWorkers');
const os = require('os');
const path = require('path');

const {
  providesModuleNodeModules,
  assetExts,
  sourceExts,
  platforms,
  DEFAULT_METRO_MINIFIER_PATH,
  defaultCreateModuleIdFactory,
} = require('./defaults');
const {FileStore} = require('metro-cache');
const {Terminal} = require('metro-core');

import type {ConfigT} from '../configTypes.flow';

const getDefaultValues = (projectRoot: ?string): ConfigT => ({
  resolver: {
    assetExts,
    platforms,
    sourceExts,
    providesModuleNodeModules: providesModuleNodeModules.slice(),
    resolverMainFields: ['browser', 'main'],
    extraNodeModules: {},
    resolveRequest: null,
    hasteImplModulePath: undefined,
    blacklistRE: blacklist(),
    useWatchman: true,
  },

  serializer: {
    polyfillModuleNames: [],
    getRunModuleStatement: (moduleId: number | string) =>
      `__r(${JSON.stringify(moduleId)});`,
    getPolyfills: () => [],
    postProcessBundleSourcemap: ({code, map, outFileName}) => ({code, map}),
    getModulesRunBeforeMainModule: () => [],
    processModuleFilter: module => true,
    createModuleIdFactory: defaultCreateModuleIdFactory,
    experimentalSerializerHook: () => {},
  },

  server: {
    useGlobalHotkey: true,
    port: 8080,
    enableVisualizer: false,
    enhanceMiddleware: middleware => middleware,
  },
  transformer: {
    assetPlugins: [],
    asyncRequireModulePath: 'metro/src/lib/bundle-modules/asyncRequire',
    assetRegistryPath: 'missing-asset-registry-path',
    babelTransformerPath: 'metro/src/defaultTransformer',
    dynamicDepsInPackages: 'throwAtRuntime',
    enableBabelRCLookup: true,
    getTransformOptions: async () => ({
      transform: {experimentalImportSupport: false, inlineRequires: false},
      preloadedModules: false,
      ramGroups: [],
    }),
    minifierPath: DEFAULT_METRO_MINIFIER_PATH,
    optimizationSizeLimit: 150 * 1024, // 150 KiB.
    postMinifyProcess: x => x,
    transformVariants: {default: {}},
    workerPath: 'metro/src/DeltaBundler/Worker',
  },
  cacheStores: [
    new FileStore({
      root: path.join(os.tmpdir(), 'metro-cache'),
    }),
  ],
  cacheVersion: '1.0',
  // We assume the default project path is two levels up from
  // node_modules/metro/
  projectRoot: projectRoot || path.resolve(__dirname, '../../..'),
  watchFolders: [],
  transformerPath: require.resolve('metro/src/JSTransformer/worker.js'),
  maxWorkers: getMaxWorkers(),
  resetCache: false,
  reporter: new TerminalReporter(new Terminal(process.stdout)),
});

async function getDefaultConfig(rootPath: ?string): Promise<ConfigT> {
  // We can add more logic here to get a sensible default configuration, for
  // now we just return a stub.

  return getDefaultValues(rootPath);
}

module.exports = getDefaultConfig;
module.exports.getDefaultValues = getDefaultValues;
