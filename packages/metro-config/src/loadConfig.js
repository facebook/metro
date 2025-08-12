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

import type {ConfigT, InputConfigT, YargArguments} from './types';

import getDefaultConfig from './defaults';
import validConfig from './defaults/validConfig';
import fs from 'fs';
import {validate} from 'jest-validate';
import * as MetroCache from 'metro-cache';
import {homedir} from 'os';
import path from 'path';
import {dirname, join} from 'path';
import {parse as parseYaml} from 'yaml';

type ResolveConfigResult = {
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

const SEARCH_PLACES = [
  'metro.config.js',
  'metro.config.cjs',
  'metro.config.mjs',
  'metro.config.json',
  'package.json',
];

const PACKAGE_JSON = path.sep + 'package.json';
const PACKAGE_JSON_PROP_NAME = 'metro';

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
): Promise<ResolveConfigResult> {
  const configPath: ?string =
    filePath != null
      ? resolve(filePath)
      : searchForConfigFile(path.resolve(process.cwd(), cwd ?? ''), homedir());

  if (configPath == null) {
    // No config file found, return a default
    return {
      isEmpty: true,
      filepath: join(cwd || process.cwd(), 'metro.config.stub.js'),
      config: {},
    };
  }
  return await loadConfigFile(configPath);
}

function mergeConfig<T: $ReadOnly<InputConfigT>>(
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
        ...totalConfig.resolver,
        // $FlowFixMe[exponential-spread]
        ...(nextConfig.resolver || {}),
        dependencyExtractor:
          nextConfig.resolver && nextConfig.resolver.dependencyExtractor != null
            ? resolve(nextConfig.resolver.dependencyExtractor)
            : // $FlowFixMe[incompatible-use]
              totalConfig.resolver.dependencyExtractor,
        hasteImplModulePath:
          nextConfig.resolver && nextConfig.resolver.hasteImplModulePath != null
            ? resolve(nextConfig.resolver.hasteImplModulePath)
            : // $FlowFixMe[incompatible-use]
              totalConfig.resolver.hasteImplModulePath,
      },
      serializer: {
        ...totalConfig.serializer,
        // $FlowFixMe[exponential-spread]
        ...(nextConfig.serializer || {}),
      },
      transformer: {
        ...totalConfig.transformer,
        // $FlowFixMe[exponential-spread]
        ...(nextConfig.transformer || {}),
        babelTransformerPath:
          nextConfig.transformer &&
          nextConfig.transformer.babelTransformerPath != null
            ? resolve(nextConfig.transformer.babelTransformerPath)
            : // $FlowFixMe[incompatible-use]
              totalConfig.transformer.babelTransformerPath,
      },
      server: {
        ...totalConfig.server,
        // $FlowFixMe[exponential-spread]
        ...(nextConfig.server || {}),
      },
      symbolicator: {
        ...totalConfig.symbolicator,
        // $FlowFixMe[exponential-spread]
        ...(nextConfig.symbolicator || {}),
      },
      watcher: {
        ...totalConfig.watcher,
        // $FlowFixMe[exponential-spread]
        ...nextConfig.watcher,
        watchman: {
          // $FlowFixMe[exponential-spread]
          ...totalConfig.watcher?.watchman,
          ...nextConfig.watcher?.watchman,
        },
        healthCheck: {
          // $FlowFixMe[exponential-spread]
          ...totalConfig.watcher?.healthCheck,
          // $FlowFixMe: Spreading shapes creates an explosion of union types
          ...nextConfig.watcher?.healthCheck,
        },
        unstable_autoSaveCache: {
          // $FlowFixMe[exponential-spread]
          ...totalConfig.watcher?.unstable_autoSaveCache,
          ...nextConfig.watcher?.unstable_autoSaveCache,
        },
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
  const resolvedConfigResults: ResolveConfigResult = await resolveConfig(
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
  const output: {
    // Spread to remove invariance so that `output` is mutable.
    ...Partial<ConfigT>,
    resolver: {...Partial<ConfigT['resolver']>},
    serializer: {...Partial<ConfigT['serializer']>},
    server: {...Partial<ConfigT['server']>},
    transformer: {...Partial<ConfigT['transformer']>},
  } = {
    resolver: {},
    serializer: {},
    server: {},
    transformer: {},
  };

  if (argv.port != null) {
    output.server.port = Number(argv.port);
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

  // Set the watchfolders to include the projectRoot, as Metro assumes that is
  // the case
  return mergeConfig(configWithArgs, {
    watchFolders: [configWithArgs.projectRoot, ...configWithArgs.watchFolders],
  });
}

export async function loadConfigFile(
  absolutePath: string,
): Promise<ResolveConfigResult> {
  // Config should be JSON, CommonJS, or ESM
  let config;
  const extension = path.extname(absolutePath);

  if (
    extension === '.json' ||
    extension === '.js' ||
    extension === '.cjs' ||
    extension === '.es6'
  ) {
    try {
      // $FlowIgnore[unsupported-syntax]
      const configModule = require(absolutePath);
      if (absolutePath.endsWith(PACKAGE_JSON)) {
        config = configModule[PACKAGE_JSON_PROP_NAME];
      } else {
        config = configModule.__esModule ? configModule.default : configModule;
      }
    } catch (e) {
      // $FlowIgnore[unsupported-syntax]
      config = await import(absolutePath);
    }
  } else if (
    extension === '' ||
    extension === '.yml' ||
    extension === '.yaml'
  ) {
    console.warn(
      'YAML config is deprecated, please migrate to JavaScript config (metro.config.js)',
    );
    config = parseYaml(fs.readFileSync(absolutePath, 'utf8'));
  } else {
    throw new Error(
      `Unsupported config file extension: ${extension}. ` +
        'Supported extensions are .json, .js, .cjs, .yml, .yaml and none (implicitly yaml).',
    );
  }

  return {
    isEmpty: false,
    filepath: absolutePath,
    config,
  };
}

export function searchForConfigFile(
  absoluteStartDir: string,
  absoluteStopDir: string,
): ?string {
  for (
    let currentDir: string = absoluteStartDir, prevDir: string;
    prevDir !== currentDir && prevDir !== absoluteStopDir;
    currentDir = path.dirname(prevDir)
  ) {
    for (const candidate of SEARCH_PLACES) {
      const candidatePath = path.join(currentDir, candidate);
      if (isFile(candidatePath)) {
        if (candidatePath.endsWith(path.sep + 'package.json')) {
          // package.json is a special case - we only find a config if
          // the json has a top-level `metro` key.
          //
          // By using `require`, we'll add the json to the Node.js module
          // cache, so we don't incur further parse cost after returning the
          // manifest's path.
          // $FlowIgnore[unsupported-syntax] dynamic require
          const content = require(candidatePath);
          if (Object.hasOwn(content, PACKAGE_JSON_PROP_NAME)) {
            return candidatePath;
          }
        } else {
          return candidatePath;
        }
      }
    }
    prevDir = currentDir;
  }
  return null;
}

export {loadConfig, resolveConfig, mergeConfig};
