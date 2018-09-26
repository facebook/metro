/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const TerminalReporter = require('metro/src/lib/TerminalReporter');

const defaults = require('../defaults/defaults');
const getDefaultConfig = require('../defaults');
const getMaxWorkers = require('metro/src/lib/getMaxWorkers');
const path = require('path');

const {convertNewToOld} = require('../convertConfig');
const {DEFAULT_METRO_MINIFIER_PATH} = require('../defaults/defaults');
const {DEFAULT} = require('../oldConfig');
const {Terminal} = require('metro-core');

const convertConfigToServerConfig = (
  config = DEFAULT,
  resetCache = false,
  maxWorkers = getMaxWorkers(),
  minifierPath,
  // $FlowFixMe TODO t0 https://github.com/facebook/flow/issues/183
  port = null,
  reporter = new TerminalReporter(new Terminal(process.stdout)),
  watch = false,
) => {
  const assetExts = defaults.assetExts.concat(
    (config.getAssetExts && config.getAssetExts()) || [],
  );
  const sourceExts = defaults.sourceExts.concat(
    (config.getSourceExts && config.getSourceExts()) || [],
  );
  const platforms = (config.getPlatforms && config.getPlatforms()) || [];

  const providesModuleNodeModules =
    typeof config.getProvidesModuleNodeModules === 'function'
      ? config.getProvidesModuleNodeModules()
      : defaults.providesModuleNodeModules;

  const watchFolders = config.getWatchFolders();
  const serverOptions: ServerOptions = {
    asyncRequireModulePath: config.getAsyncRequireModulePath(),
    assetExts,
    assetRegistryPath: config.assetRegistryPath,
    blacklistRE: config.getBlacklistRE(),
    cacheStores: config.cacheStores,
    cacheVersion: config.cacheVersion,
    createModuleIdFactory: config.createModuleIdFactory,
    dynamicDepsInPackages: config.dynamicDepsInPackages,
    enableBabelRCLookup: config.getEnableBabelRCLookup(),
    extraNodeModules: config.extraNodeModules,
    getModulesRunBeforeMainModule: config.getModulesRunBeforeMainModule,
    getPolyfills: config.getPolyfills,
    getResolverMainFields: config.getResolverMainFields,
    getRunModuleStatement: config.getRunModuleStatement,
    getTransformOptions: config.getTransformOptions,
    hasteImplModulePath: config.hasteImplModulePath,
    maxWorkers,
    minifierPath,
    platforms: defaults.platforms.concat(platforms),
    postMinifyProcess: config.postMinifyProcess,
    postProcessBundleSourcemap: config.postProcessBundleSourcemap,
    providesModuleNodeModules,
    resetCache,
    reporter,
    resolveRequest: config.resolveRequest,
    sourceExts,
    transformModulePath: config.getTransformModulePath(),
    watch,
    watchFolders,
    workerPath: config.getWorkerPath && config.getWorkerPath(),
    projectRoot: config.getProjectRoot(),
  };

  return serverOptions;
};

describe('convertConfig', () => {
  let warningMessages = [];

  beforeEach(() => {
    warningMessages = [];

    console.warn = jest.fn(warn => {
      warningMessages.push(warn);
    });
  });

  it('can convert an empty config', () => {
    expect(convertNewToOld({})).toMatchSnapshot();
  });

  it('can convert a default configuration', async () => {
    const defaultConfig = await getDefaultConfig('/');
    defaultConfig.maxWorkers = 0;
    defaultConfig.reporter = null;
    defaultConfig.cacheStores = [];
    defaultConfig.transformerPath = '';

    expect(convertNewToOld(defaultConfig)).toMatchSnapshot();
  });

  it('converts the new default config exactly to the old default config', async () => {
    // This is a test we can remove later. It checks if the converted default configuration
    // of the new configuration is equal to the default old config.

    const defaultConfig = await getDefaultConfig(
      path.join(__dirname, '..', '..', '..', '..'),
    );
    const convertedConfig = convertNewToOld(defaultConfig);

    const config = convertConfigToServerConfig(
      undefined,
      false,
      getMaxWorkers(),
      DEFAULT_METRO_MINIFIER_PATH,
      null,
      new TerminalReporter(new Terminal(process.stdout)),
      false,
    );

    const ADDED_FIELDS = [
      'enhanceMiddleware',
      'getUseGlobalHotkey',
      'polyfillModuleNames',
      'port',
    ];
    expect(
      Object.keys(config)
        .filter(key => ADDED_FIELDS.indexOf(key) === -1)
        .sort(),
    ).toEqual(
      Object.keys(convertedConfig.serverOptions)
        .filter(key => ADDED_FIELDS.indexOf(key) === -1)
        .sort(),
    );

    const IGNORED_FIELDS = [
      'reporter',
      'createModuleIdFactory',
      'getTransformOptions',
    ];
    // We check all properties separately and also check if the function outputs
    // are exactly the same
    Object.keys(config).forEach(key => {
      if (IGNORED_FIELDS.indexOf(key) > -1) {
        return;
      }

      if (key === 'postProcessBundleSourcemap') {
        expect(config[key]({code: '', map: ''})).toEqual(
          convertedConfig.serverOptions[key]({code: '', map: ''}),
        );
      } else if (typeof config[key] === 'function') {
        expect(config[key]()).toEqual(convertedConfig.serverOptions[key]());
      } else {
        expect(config[key]).toEqual(convertedConfig.serverOptions[key]);
      }
    });
  });
});
