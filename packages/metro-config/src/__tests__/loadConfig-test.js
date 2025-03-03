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

jest.mock('cosmiconfig');

const getDefaultConfig = require('../defaults');
const {loadConfig} = require('../loadConfig');
const cosmiconfig = require('cosmiconfig');
const path = require('path');
const prettyFormat = require('pretty-format');
const util = require('util');

describe('loadConfig', () => {
  beforeEach(() => {
    cosmiconfig.reset();
  });

  test('can load config objects', async () => {
    const config: any = {
      reporter: null,
      maxWorkers: 2,
      cacheStores: [],
      transformerPath: '',
      resolver: {
        emptyModulePath: 'metro-runtime/src/modules/empty-module',
      },
    };

    cosmiconfig.setResolvedConfig(config);

    const result = await loadConfig({});

    expect(result).toMatchSnapshot();
    expect(result.cacheStores).toEqual([]);
  });

  test('can load config from function', async () => {
    const config = (defaultConfig: any): any => ({
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

  test('can load the config from a path', async () => {
    const config = (defaultConfig: any): any => ({
      ...defaultConfig,
      projectRoot: '/',
      reporter: null,
      maxWorkers: 2,
      cacheStores: [],
      transformerPath: '',
      resolver: {
        emptyModulePath: 'metro-runtime/src/modules/empty-module',
      },
    });

    cosmiconfig.setResolvedConfig(config);

    // We don't actually use the specified file in this test but it needs to
    // resolve to a real file on the file system.
    const result = await loadConfig({config: './__tests__/loadConfig-test.js'});

    const relativizedResult = {
      ...result,
      transformer: {
        // Remove absolute paths from the result.
        ...result.transformer,
        babelTransformerPath: path.relative(
          path.join(
            require.resolve('metro-babel-transformer'),
            '..',
            '..',
            '..',
          ),
          result.transformer.babelTransformerPath,
        ),
      },
    };
    expect(relativizedResult).toMatchSnapshot();
    expect(cosmiconfig.hasLoadBeenCalled()).toBeTruthy();
  });

  test('can load the config from a path pointing to a directory', async () => {
    const config = (defaultConfig: any): any => ({
      ...defaultConfig,
      projectRoot: '/',
      reporter: null,
      maxWorkers: 2,
      cacheStores: [],
      transformerPath: '',
      resolver: {
        emptyModulePath: 'metro-runtime/src/modules/empty-module',
      },
    });

    cosmiconfig.setResolvedConfig(config);

    // We don't actually use the specified file in this test but it needs to
    // resolve to a real file on the file system.
    const result = await loadConfig({config: path.resolve(__dirname, '../')});

    const relativizedResult = {
      ...result,
      transformer: {
        ...result.transformer,
        // Remove absolute paths from the result.
        babelTransformerPath: path.relative(
          path.join(
            require.resolve('metro-babel-transformer'),
            '..',
            '..',
            '..',
          ),
          result.transformer.babelTransformerPath,
        ),
      },
    };
    expect(relativizedResult).toMatchSnapshot();
    expect(cosmiconfig.hasLoadBeenCalled()).toBeTruthy();
  });

  test('can load the config with no config present', async () => {
    cosmiconfig.setReturnNull(true);

    const result = await loadConfig({cwd: process.cwd()});

    let defaultConfig = await getDefaultConfig(process.cwd());
    defaultConfig = {
      ...defaultConfig,
      watchFolders: [defaultConfig.projectRoot, ...defaultConfig.watchFolders],
    };

    expect(prettyFormat.format(result)).toEqual(
      prettyFormat.format(defaultConfig),
    );
  });

  test('validates config for server', async () => {
    expect.assertions(1);
    const config = (defaultConfig: any) => ({
      ...defaultConfig,
      server: {
        useGlobalHotkey: 'test',
      },
    });

    cosmiconfig.setResolvedConfig(config);

    try {
      await loadConfig({});
    } catch (error) {
      expect(util.stripVTControlCharacters(error.message)).toMatchSnapshot();
    }
  });

  test('validates config for projectRoot', async () => {
    expect.assertions(1);
    const config = (defaultConfig: any) => ({
      ...defaultConfig,
      projectRoot: ['test'],
    });

    cosmiconfig.setResolvedConfig(config);

    try {
      await loadConfig({});
    } catch (error) {
      expect(util.stripVTControlCharacters(error.message)).toMatchSnapshot();
    }
  });

  test('injects `metro-cache` into the `cacheStores` callback', async () => {
    const config = {
      reporter: null,
      maxWorkers: 2,
      cacheStores: jest.fn(() => []),
      transformerPath: '',
      resolver: {
        emptyModulePath: 'metro-runtime/src/modules/empty-module',
      },
    };

    cosmiconfig.setResolvedConfig(config);

    const result = await loadConfig({});

    expect(result).toMatchSnapshot();
    expect(result.cacheStores).toEqual([]);
    expect(config.cacheStores).toBeCalledWith(require('metro-cache'));
  });
});
