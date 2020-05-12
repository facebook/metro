/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @flow
 * @format
 */

'use strict';

jest.mock('cosmiconfig');

const {loadConfig} = require('../loadConfig');
const getDefaultConfig = require('../defaults');
const cosmiconfig = require('cosmiconfig');
const prettyFormat = require('pretty-format');
const stripAnsi = require('strip-ansi');

describe('loadConfig', () => {
  beforeEach(() => {
    cosmiconfig.reset();
  });

  it('can load config objects', async () => {
    const config = {
      reporter: null,
      maxWorkers: 2,
      cacheStores: [],
      transformerPath: '',
    };

    cosmiconfig.setResolvedConfig(config);

    const result = await loadConfig({});

    expect(result).toMatchSnapshot();
    expect(result.cacheStores).toEqual([]);
  });

  it('can load config from function', async () => {
    const config = defaultConfig => ({
      ...defaultConfig,
      cacheStores: [],
      reporter: null,
      maxWorkers: 2,
      resolver: {
        sourceExts: [...defaultConfig.resolver.sourceExts, 'tsx'],
        hasteImplModulePath: 'test',
      },
      transformerPath: '',
    });

    cosmiconfig.setResolvedConfig(config);

    const defaultConfigOverrides = {
      resolver: {
        sourceExts: ['json', 're'],
      },
    };

    const result = await loadConfig({}, defaultConfigOverrides);
    const defaults = await getDefaultConfig();
    expect(result.resolver).toMatchObject({
      assetExts: defaults.resolver.assetExts,
      sourceExts: ['json', 're', 'tsx'],
      hasteImplModulePath: 'test',
    });
  });

  it('can load the config with a path', async () => {
    const config = defaultConfig => ({
      ...defaultConfig,
      reporter: null,
      maxWorkers: 2,
      cacheStores: [],
      transformerPath: '',
    });

    cosmiconfig.setResolvedConfig(config);

    const result = await loadConfig({config: '/metro.config.js'});

    expect(result).toMatchSnapshot();
    expect(cosmiconfig.hasLoadBeenCalled()).toBeTruthy();
  });

  it('can load the config with no config present', async () => {
    cosmiconfig.setReturnNull(true);

    const result = await loadConfig({cwd: process.cwd()});

    let defaultConfig = await getDefaultConfig(process.cwd());
    defaultConfig = {
      ...defaultConfig,
      watchFolders: [defaultConfig.projectRoot, ...defaultConfig.watchFolders],
    };

    expect(prettyFormat(result)).toEqual(prettyFormat(defaultConfig));
  });

  it('validates config for server', async () => {
    expect.assertions(1);
    const config = defaultConfig => ({
      ...defaultConfig,
      server: {
        useGlobalHotkey: 'test',
      },
    });

    cosmiconfig.setResolvedConfig(config);

    try {
      await loadConfig({});
    } catch (error) {
      expect(stripAnsi(error.message)).toMatchSnapshot();
    }
  });

  it('validates config for projectRoot', async () => {
    expect.assertions(1);
    const config = defaultConfig => ({
      ...defaultConfig,
      projectRoot: ['test'],
    });

    cosmiconfig.setResolvedConfig(config);

    try {
      await loadConfig({});
    } catch (error) {
      expect(stripAnsi(error.message)).toMatchSnapshot();
    }
  });
});
