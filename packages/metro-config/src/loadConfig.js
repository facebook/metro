/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

import type {ConfigT, InputConfigT, YargArguments} from './configTypes.flow';

const getDefaultConfig = require('./defaults');
const validConfig = require('./defaults/validConfig');
const xtends = require('@topoconfig/extends');
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
  searchPlaces: [
    'metro.config.js',
    'metro.config.cjs',
    'metro.config.json',
    'package.json',
  ],
  loaders: {
    '.json': cosmiconfig.loadJson,
    '.yaml': cosmiconfig.loadYaml,
    '.yml': cosmiconfig.loadYaml,
    '.js': cosmiconfig.loadJs,
    '.cjs': cosmiconfig.loadJs,
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

const resolveExtra = (base: any = {}, key: string, resolver: Function) => {
  const value = base[key];
  return value != null ? {[key]: resolver(value)} : {};
};

function mergeConfig<T: $ReadOnly<InputConfigT>>(
  defaultConfig: T,
  ...configs: Array<InputConfigT>
): T {
  // If the file is a plain object we merge the file with the default config,
  // for the function we don't do this since that's the responsibility of the user
  return xtends.populateSync(defaultConfig, {
    // $FlowFixMe[prop-missing]
    cwd: mergeConfig.cwd,
    extends: configs.map(c => {
      return {
        ...c,
        transformer: {
          ...(c.transformer || {}),
          ...(resolveExtra(c.transformer, 'babelTransformerPath', resolve): {
            babelTransformerPath?: string,
          }),
        },
        resolver: {
          ...(c.resolver || {}),
          ...(resolveExtra(c.resolver, 'dependencyExtractor', resolve): {
            dependencyExtractor?: string,
          }),
          ...(resolveExtra(c.resolver, 'hasteImplModulePath', resolve): {
            hasteImplModulePath?: string,
          }),
        },
        ...resolveExtra(c, 'cacheStores', stores => {
          return typeof stores === 'function' ? stores(MetroCache) : stores;
        }),
      };
    }),
    rules: {
      '*': 'override',
      resolver: 'merge',
      serializer: 'merge',
      server: 'merge',
      symbolicator: 'merge',
      transformer: 'merge',
      watcher: 'merge',
      'watcher.watchman': 'merge',
      'watcher.healthCheck': 'merge',
    },
  });
}

// `mergeConfig` is public, so we should try to keep its API stable
// This trick is necessary to pass the proper cwd to the internal `populateSync` call
const mergeConfigWithCwd = <T: $ReadOnly<InputConfigT>>(
  cwd: string,
  base: T,
  extra: ConfigT | InputConfigT,
): T => {
  // $FlowFixMe[prop-missing]
  mergeConfig.cwd = cwd;

  // $FlowFixMe[incompatible-variance]
  // $FlowFixMe[incompatible-call]
  const config = mergeConfig(base, extra);
  // $FlowFixMe[prop-missing]
  mergeConfig.cwd = undefined;
  return config;
};

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
  const defaultConfig: ConfigT = mergeConfigWithCwd(
    rootPath,
    defaults,
    defaultConfigOverrides,
  );

  if (typeof configModule === 'function') {
    // Get a default configuration based on what we know, which we in turn can pass
    // to the function.

    const resultedConfig = await configModule(defaultConfig);
    return mergeConfigWithCwd(rootPath, defaultConfig, resultedConfig);
  }

  return mergeConfigWithCwd(rootPath, defaultConfig, configModule);
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
    // $FlowFixMe[incompatible-use]
    // $FlowFixMe[cannot-write]
    output.server.port = Number(argv.port);
  }

  if (argv.projectRoot != null) {
    output.projectRoot = argv.projectRoot;
  }

  if (argv.watchFolders != null) {
    output.watchFolders = argv.watchFolders;
  }

  if (argv.assetExts != null) {
    // $FlowFixMe[incompatible-use]
    // $FlowFixMe[cannot-write]
    output.resolver.assetExts = argv.assetExts;
  }

  if (argv.sourceExts != null) {
    // $FlowFixMe[incompatible-use]
    // $FlowFixMe[cannot-write]
    output.resolver.sourceExts = argv.sourceExts;
  }

  if (argv.platforms != null) {
    // $FlowFixMe[incompatible-use]
    // $FlowFixMe[cannot-write]
    output.resolver.platforms = argv.platforms;
  }

  if (argv['max-workers'] != null || argv.maxWorkers != null) {
    output.maxWorkers = Number(argv['max-workers'] || argv.maxWorkers);
  }

  if (argv.transformer != null) {
    // $FlowFixMe[incompatible-use]
    // $FlowFixMe[cannot-write]
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

  // $FlowFixMe[incompatible-variance]
  // $FlowFixMe[incompatible-call]
  return mergeConfig(config, output);
}

/**
 * Load the metro configuration from disk
 * @param  {object} argv                    Arguments coming from the CLI, can be empty
 * @param  {object} defaultConfigOverrides  A configuration that can override the default config
 * @return {object}                         Configuration returned
 */
async function loadConfig(
  argvInput?: YargArguments = {},
  defaultConfigOverrides?: InputConfigT = {},
): Promise<ConfigT> {
  const argv = {...argvInput, config: overrideArgument(argvInput.config)};

  const configuration = await loadMetroConfigFromDisk(
    argv.config,
    argv.cwd,
    defaultConfigOverrides,
  );

  validate(configuration, {
    exampleConfig: await validConfig(),
    recursiveDenylist: ['reporter', 'resolver', 'transformer'],
    deprecatedConfig: {
      blacklistRE: () =>
        `Warning: Metro config option \`blacklistRE\` is deprecated.
         Please use \`blockList\` instead.`,
    },
  });

  // Override the configuration with cli parameters
  const configWithArgs = overrideConfigWithArguments(configuration, argv);

  const overriddenConfig: {[string]: mixed} = {};

  overriddenConfig.watchFolders = [
    configWithArgs.projectRoot,
    ...configWithArgs.watchFolders,
  ];

  // Set the watchfolders to include the projectRoot, as Metro assumes that is
  // the case
  // $FlowFixMe[incompatible-variance]
  // $FlowFixMe[incompatible-indexer]
  // $FlowFixMe[incompatible-call]
  return mergeConfig(configWithArgs, overriddenConfig);
}

module.exports = {
  loadConfig,
  resolveConfig,
  mergeConfig,
};
