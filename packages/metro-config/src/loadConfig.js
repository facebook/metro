/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const cosmiconfig = require('cosmiconfig');
const getDefaultConfig = require('./defaults');

const {dirname, join, resolve} = require('path');

import type {
  ConfigT,
  InputConfigT,
  IntermediateConfigT,
} from './configTypes.flow';

type CosmiConfigResult = {
  filepath: string,
  isEmpty: boolean,
  config:
    | (IntermediateConfigT => Promise<IntermediateConfigT>)
    | (IntermediateConfigT => IntermediateConfigT)
    | InputConfigT,
} | null;

type YargArguments = {
  config?: string,
  cwd?: string,
  port?: string | number,
  host?: string,
  projectRoot?: string,
  watchFolders?: Array<string>,
  assetExts?: Array<string>,
  sourceExts?: Array<string>,
  platforms?: Array<string>,
  providesModuleNodeModules?: Array<string>,
  'max-workers'?: string | number,
  maxWorkers?: string | number,
  transformer?: string,
  'reset-cache'?: boolean,
  resetCache?: boolean,
  verbose?: boolean,
};

const explorer = cosmiconfig('metro', {
  searchPlaces: ['metro-config.js', 'metro-config.json', 'package.json'],

  loaders: {
    '.json': cosmiconfig.loadJson,
    '.yaml': cosmiconfig.loadYaml,
    '.yml': cosmiconfig.loadYaml,
    '.js': cosmiconfig.loadJs,
    '.es6': cosmiconfig.loadJs,
    noExt: cosmiconfig.loadYaml,
  },
});

function resolveConfig(
  path?: string,
  cwd?: string,
): Promise<CosmiConfigResult> {
  if (path) {
    return explorer.load(path);
  }

  return explorer.search(cwd);
}

function mergeConfig(
  defaultConfig: IntermediateConfigT,
  configModule: InputConfigT,
) {
  // If the file is a plain object we merge the file with the default config,
  // for the function we don't do this since that's the responsibility of the user
  return {
    ...defaultConfig,
    ...configModule,

    resolver: {
      ...defaultConfig.resolver,
      ...(configModule.resolver || {}),
    },
    serializer: {
      ...defaultConfig.serializer,
      ...(configModule.serializer || {}),
    },
    transformer: {
      ...defaultConfig.transformer,
      ...(configModule.transformer || {}),
    },
    server: {
      ...defaultConfig.server,
      ...(configModule.server || {}),
    },
  };
}

async function loadMetroConfigFromDisk(
  path?: string,
  cwd?: string,
): Promise<IntermediateConfigT> {
  const resolvedConfigResults: CosmiConfigResult = await resolveConfig(
    path,
    cwd,
  );

  if (resolvedConfigResults == null) {
    throw new Error(
      "Could not find configuration for metro, did you create a 'metro-config.js'?",
    );
  }

  const {config: configModule, filepath} = resolvedConfigResults;
  const rootPath = dirname(filepath);

  const defaultConfig: IntermediateConfigT = await getDefaultConfig(rootPath);

  if (typeof configModule === 'function') {
    // Get a default configuration based on what we know, which we in turn can pass
    // to the function.

    const resultedConfig: IntermediateConfigT = await configModule(
      defaultConfig,
    );
    return resultedConfig;
  }

  const mergedConfig = mergeConfig(defaultConfig, configModule);

  // $FlowExpectedError
  return mergedConfig;
}

function overrideConfigWithArguments(
  config: IntermediateConfigT,
  argv: YargArguments,
): IntermediateConfigT {
  // We override some config arguments here with the argv

  if (argv.port != null) {
    config.server.port = Number(argv.port);
  }

  if (argv.projectRoot != null) {
    config.projectRoot = argv.projectRoot;
  }

  if (argv.watchFolders != null) {
    config.watchFolders = argv.watchFolders;
  }

  if (argv.assetExts != null) {
    config.resolver.assetExts = argv.assetExts;
  }

  if (argv.sourceExts != null) {
    config.resolver.sourceExts = argv.sourceExts;
  }

  if (argv.platforms != null) {
    config.resolver.platforms = argv.platforms;
  }

  if (argv.providesModuleNodeModules != null) {
    config.resolver.providesModuleNodeModules = argv.providesModuleNodeModules;
  }

  if (argv['max-workers'] != null || argv.maxWorkers != null) {
    config.maxWorkers = Number(argv['max-workers'] || argv.maxWorkers);
  }

  if (argv.transformer != null) {
    config.transformModulePath = resolve(argv.transformer);
  }

  if (argv['reset-cache'] != null) {
    config.resetCache = argv['reset-cache'];
  }

  if (argv.resetCache != null) {
    config.resetCache = argv.resetCache;
  }

  if (argv.verbose === false) {
    config.reporter = {update: () => {}};
    // TODO: Ask if this is the way to go
  }

  return config;
}

async function loadConfig(argv: YargArguments): Promise<ConfigT> {
  const configuration: IntermediateConfigT = await loadMetroConfigFromDisk(
    argv.config,
    argv.cwd,
  );

  // Override the configuration with cli parameters
  const overriddenConfig: ConfigT = overrideConfigWithArguments(
    configuration,
    argv,
  );

  // Set the watchfolders to include the projectRoot, as Metro assumes that is
  // the case
  overriddenConfig.watchFolders = [
    overriddenConfig.projectRoot,
    ...overriddenConfig.watchFolders,
  ];

  return overriddenConfig;
}

module.exports = {
  loadConfig,
  resolveConfig,
  mergeConfig,
};
