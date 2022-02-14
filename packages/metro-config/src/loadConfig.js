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

import type {ConfigT, InputConfigT, YargArguments} from './configTypes.flow';

const getDefaultConfig = require('./defaults');
const validConfig = require('./defaults/validConfig');
const cosmiconfig = require('cosmiconfig');
const fs = require('fs');
const {validate} = require('jest-validate');
const MetroCache = require('metro-cache');
const path = require('path');
const {dirname, join} = require('path');

type CosmiConfigResult = {
  filepath: string,
  isEmpty: boolean,
  config: (ConfigT => Promise<ConfigT>) | (ConfigT => ConfigT) | InputConfigT,
  ...
};

/**
 * Takes the last argument if multiple of the same argument are given
 */
function overrideArgument<T>(arg: Array<T> | T): T {
  if (arg == null) {
    return arg;
  }

  if (Array.isArray(arg)) {
    // $FlowFixMe[incompatible-return]
    return arg[arg.length - 1];
  }

  return arg;
}

const explorer = cosmiconfig('metro', {
  searchPlaces: ['metro.config.js', 'metro.config.json', 'package.json'],

  loaders: {
    '.json': cosmiconfig.loadJson,
    '.yaml': cosmiconfig.loadYaml,
    '.yml': cosmiconfig.loadYaml,
    '.js': cosmiconfig.loadJs,
    '.es6': cosmiconfig.loadJs,
    noExt: cosmiconfig.loadYaml,
  },
});

const isFile = (filePath: string) =>
  fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory();

const resolve = (filePath: string) => {
  // Attempt to resolve the path with the node resolution algorithm but fall back to resolving
  // the file relative to the current working directory if the input is not an absolute path.
  try {
    return require.resolve(filePath);
  } catch (error) {
    if (path.isAbsolute(filePath) || error.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
  }

  const possiblePath = path.resolve(process.cwd(), filePath);
  return isFile(possiblePath) ? possiblePath : filePath;
};

async function resolveConfig(
  filePath?: string,
  cwd?: string,
): Promise<CosmiConfigResult> {
  if (filePath) {
    return explorer.load(resolve(filePath));
  }

  const result = await explorer.search(cwd);
  if (result == null) {
    // No config file found, return a default
    return {
      isEmpty: true,
      filepath: join(cwd || process.cwd(), 'metro.config.stub.js'),
      config: {},
    };
  }

  return result;
}

function mergeConfig<T: InputConfigT>(
  defaultConfig: T,
  ...configs: Array<InputConfigT>
): T {
  // If the file is a plain object we merge the file with the default config,
  // for the function we don't do this since that's the responsibility of the user
  return configs.reduce(
    (totalConfig, nextConfig) => ({
      ...totalConfig,
      ...nextConfig,

      cacheStores:
        nextConfig.cacheStores != null
          ? typeof nextConfig.cacheStores === 'function'
            ? nextConfig.cacheStores(MetroCache)
            : nextConfig.cacheStores
          : totalConfig.cacheStores,

      resolver: {
        /* $FlowFixMe(>=0.111.0 site=react_native_fb) This comment suppresses
         * an error found when Flow v0.111 was deployed. To see the error,
         * delete this comment and run Flow. */
        ...totalConfig.resolver,
        ...(nextConfig.resolver || {}),
        dependencyExtractor:
          nextConfig.resolver && nextConfig.resolver.dependencyExtractor != null
            ? resolve(nextConfig.resolver.dependencyExtractor)
            : totalConfig.resolver.dependencyExtractor,
        hasteImplModulePath:
          nextConfig.resolver && nextConfig.resolver.hasteImplModulePath != null
            ? resolve(nextConfig.resolver.hasteImplModulePath)
            : totalConfig.resolver.hasteImplModulePath,
      },
      serializer: {
        /* $FlowFixMe(>=0.111.0 site=react_native_fb) This comment suppresses
         * an error found when Flow v0.111 was deployed. To see the error,
         * delete this comment and run Flow. */
        ...totalConfig.serializer,
        ...(nextConfig.serializer || {}),
      },
      transformer: {
        /* $FlowFixMe(>=0.111.0 site=react_native_fb) This comment suppresses
         * an error found when Flow v0.111 was deployed. To see the error,
         * delete this comment and run Flow. */
        ...totalConfig.transformer,
        ...(nextConfig.transformer || {}),
        babelTransformerPath:
          nextConfig.transformer &&
          nextConfig.transformer.babelTransformerPath != null
            ? resolve(nextConfig.transformer.babelTransformerPath)
            : totalConfig.transformer.babelTransformerPath,
      },
      server: {
        /* $FlowFixMe(>=0.111.0 site=react_native_fb) This comment suppresses
         * an error found when Flow v0.111 was deployed. To see the error,
         * delete this comment and run Flow. */
        ...totalConfig.server,
        ...(nextConfig.server || {}),
      },
      symbolicator: {
        /* $FlowFixMe(>=0.111.0 site=react_native_fb) This comment suppresses
         * an error found when Flow v0.111 was deployed. To see the error,
         * delete this comment and run Flow. */
        ...totalConfig.symbolicator,
        ...(nextConfig.symbolicator || {}),
      },
    }),
    defaultConfig,
  );
}

async function loadMetroConfigFromDisk(
  path?: string,
  cwd?: string,
  defaultConfigOverrides: InputConfigT,
): Promise<ConfigT> {
  const resolvedConfigResults: CosmiConfigResult = await resolveConfig(
    path,
    cwd,
  );

  const {config: configModule, filepath} = resolvedConfigResults;
  const rootPath = dirname(filepath);

  const defaults = await getDefaultConfig(rootPath);
  const defaultConfig: ConfigT = mergeConfig(defaults, defaultConfigOverrides);

  if (typeof configModule === 'function') {
    // Get a default configuration based on what we know, which we in turn can pass
    // to the function.

    const resultedConfig = await configModule(defaultConfig);
    return mergeConfig(defaultConfig, resultedConfig);
  }

  return mergeConfig(defaultConfig, configModule);
}

function overrideConfigWithArguments(
  config: ConfigT,
  argv: YargArguments,
): ConfigT {
  // We override some config arguments here with the argv

  const output: InputConfigT = {
    resolver: {},
    serializer: {},
    server: {},
    transformer: {},
  };

  if (argv.port != null) {
    output.server.port = Number(argv.port);
  }

  if (argv.runInspectorProxy != null) {
    output.server.runInspectorProxy = Boolean(argv.runInspectorProxy);
  }

  if (argv.projectRoot != null) {
    output.projectRoot = argv.projectRoot;
  }

  if (argv.watchFolders != null) {
    output.watchFolders = argv.watchFolders;
  }

  if (argv.assetExts != null) {
    output.resolver.assetExts = argv.assetExts;
  }

  if (argv.sourceExts != null) {
    output.resolver.sourceExts = argv.sourceExts;
  }

  if (argv.platforms != null) {
    output.resolver.platforms = argv.platforms;
  }

  if (argv['max-workers'] != null || argv.maxWorkers != null) {
    output.maxWorkers = Number(argv['max-workers'] || argv.maxWorkers);
  }

  if (argv.transformer != null) {
    output.transformer.babelTransformerPath = argv.transformer;
  }

  if (argv['reset-cache'] != null) {
    output.resetCache = argv['reset-cache'];
  }

  if (argv.resetCache != null) {
    output.resetCache = argv.resetCache;
  }

  if (argv.verbose === false) {
    output.reporter = {update: () => {}};
    // TODO: Ask if this is the way to go
  }

  return mergeConfig(config, output);
}

/**
 * Load the metro configuration from disk
 * @param  {object} argv                    Arguments coming from the CLI, can be empty
 * @param  {object} defaultConfigOverrides  A configuration that can override the default config
 * @return {object}                         Configuration returned
 */
async function loadConfig(
  argv?: YargArguments = {},
  defaultConfigOverrides?: InputConfigT = {},
): Promise<ConfigT> {
  argv.config = overrideArgument(argv.config);

  const configuration = await loadMetroConfigFromDisk(
    argv.config,
    argv.cwd,
    defaultConfigOverrides,
  );

  validate(configuration, {
    exampleConfig: await validConfig(),
    recursiveBlacklist: ['reporter', 'resolver', 'transformer'],
    deprecatedConfig: {
      blacklistRE: () =>
        `Warning: Metro config option \`blacklistRE\` is deprecated.
         Please use \`blockList\` instead.`,
    },
  });

  // Override the configuration with cli parameters
  const configWithArgs = overrideConfigWithArguments(configuration, argv);

  const overriddenConfig = {};

  // The resolver breaks if "json" is missing from `resolver.sourceExts`
  const sourceExts = configWithArgs.resolver.sourceExts;
  if (!configWithArgs.resolver.sourceExts.includes('json')) {
    overriddenConfig.resolver = {
      sourceExts: [...sourceExts, 'json'],
    };
  }

  overriddenConfig.watchFolders = [
    configWithArgs.projectRoot,
    ...configWithArgs.watchFolders,
  ];

  // Set the watchfolders to include the projectRoot, as Metro assumes that is
  // the case
  return mergeConfig(configWithArgs, overriddenConfig);
}

module.exports = {
  loadConfig,
  resolveConfig,
  mergeConfig,
};
