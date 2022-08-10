/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

import type {ConfigT} from '../configTypes.flow';

const {
  DEFAULT_METRO_MINIFIER_PATH,
  assetExts,
  assetResolutions,
  additionalExts,
  defaultCreateModuleIdFactory,
  platforms,
  sourceExts,
} = require('./defaults');
const exclusionList = require('./exclusionList');
const {FileStore} = require('metro-cache');
const {Terminal} = require('metro-core');
const getMaxWorkers = require('metro/src/lib/getMaxWorkers');
const TerminalReporter = require('metro/src/lib/TerminalReporter');
const os = require('os');
const path = require('path');

const getDefaultValues = (projectRoot: ?string): ConfigT => ({
  resolver: {
    assetExts,
    assetResolutions,
    platforms,
    sourceExts,
    blockList: exclusionList(),
    dependencyExtractor: undefined,
    disableHierarchicalLookup: false,
    emptyModulePath: require.resolve(
      'metro-runtime/src/modules/empty-module.js',
    ),
    extraNodeModules: {},
    hasteImplModulePath: undefined,
    nodeModulesPaths: [],
    resolveRequest: null,
    resolverMainFields: ['browser', 'main'],
    useWatchman: true,
    requireCycleIgnorePatterns: [/(^|\/|\\)node_modules($|\/|\\)/],
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
    customSerializer: null,
  },

  server: {
    useGlobalHotkey: true,
    port: 8080,
    enhanceMiddleware: middleware => middleware,
    rewriteRequestUrl: url => url,
    runInspectorProxy: true,
    verifyConnections: false,
    unstable_serverRoot: null,
  },

  symbolicator: {
    customizeFrame: () => {},
  },

  transformer: {
    assetPlugins: [],
    asyncRequireModulePath: 'metro-runtime/src/modules/asyncRequire',
    assetRegistryPath: 'missing-asset-registry-path',
    babelTransformerPath: 'metro-babel-transformer',
    dynamicDepsInPackages: 'throwAtRuntime',
    enableBabelRCLookup: true,
    enableBabelRuntime: true,
    experimentalImportBundleSupport: false,
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: false,
        unstable_disableES6Transforms: false,
      },
      preloadedModules: false,
      ramGroups: [],
    }),
    globalPrefix: '',
    hermesParser: false,
    minifierConfig: {
      mangle: {
        toplevel: false,
      },
      output: {
        ascii_only: true,
        quote_style: 3,
        wrap_iife: true,
      },
      sourceMap: {
        includeSources: false,
      },
      toplevel: false,
      compress: {
        // reduce_funcs inlines single-use functions, which cause perf regressions.
        reduce_funcs: false,
      },
    },
    minifierPath: DEFAULT_METRO_MINIFIER_PATH,
    optimizationSizeLimit: 150 * 1024, // 150 KiB.
    transformVariants: {default: {}},
    workerPath: 'metro/src/DeltaBundler/Worker',
    publicPath: '/assets',
    allowOptionalDependencies: false,
    unstable_allowRequireContext: false,
    unstable_collectDependenciesPath:
      'metro/src/ModuleGraph/worker/collectDependencies.js',
    unstable_dependencyMapReservedName: null,
    unstable_disableModuleWrapping: false,
    unstable_disableNormalizePseudoGlobals: false,
    unstable_compactOutput: false,
  },
  watcher: {
    additionalExts,
    watchman: {
      deferStates: ['hg.update'],
    },
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
  stickyWorkers: true,
  watchFolders: [],
  transformerPath: 'metro-transform-worker',
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
