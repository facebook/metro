/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @flow
 * @format
 */

'use strict';

jest.mock('cosmiconfig');

const {loadConfig} = require('../loadConfig');
const getDefaultConfig = require('../defaults');
const cosmiconfig = require('cosmiconfig');

describe('loadConfig', () => {
  beforeEach(() => {
    cosmiconfig.reset();
  });

  it('can load config objects', async () => {
    const config = {
      metro: true,
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
      resolver: 'test',
      transformerPath: '',
    });

    cosmiconfig.setResolvedConfig(config);

    const result = await loadConfig({});

    expect(result.resolver).toEqual('test');
  });

  it('can load the config with a path', async () => {
    const config = defaultConfig => ({
      ...defaultConfig,
      metro: true,
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

    const result = await loadConfig();
    result.reporter = {update: () => {}};

    const defaultConfig = await getDefaultConfig(process.cwd());
    defaultConfig.watchFolders = [
      defaultConfig.projectRoot,
      ...defaultConfig.watchFolders,
    ];
    defaultConfig.reporter = {update: () => {}};

    expect(JSON.stringify(result)).toEqual(JSON.stringify(defaultConfig));
  });
});
