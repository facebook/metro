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

const FIXTURES_DIR = path.resolve(__dirname, '..', '__fixtures__');

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

  test('adds the real project root if it is not already covered', async () => {
    cosmiconfig.setReturnNull(true);

    const projectRoot = path.resolve(
      FIXTURES_DIR,
      'link-to-workspace-root',
      'project-root',
    );

    const result = await loadConfig(
      {
        cwd: projectRoot,
      },
      {
        watchFolders: [path.join(FIXTURES_DIR, 'other-watched-folder')],
      },
    );

    let defaultConfig = await getDefaultConfig(projectRoot);
    defaultConfig = {
      ...defaultConfig,
      // Expect symlinks in the given project root to be resolved.
      projectRoot: path.join(FIXTURES_DIR, 'workspace-root', 'project-root'),
      watchFolders: [
        // Project root has been added to the watch folders.
        path.join(FIXTURES_DIR, 'workspace-root', 'project-root'),
        path.join(FIXTURES_DIR, 'other-watched-folder'),
      ],
    };

    expect(prettyFormat.format(result)).toEqual(
      prettyFormat.format(defaultConfig),
    );
  });

  test('does not add the project root if it is already covered', async () => {
    cosmiconfig.setReturnNull(true);

    const projectRoot = path.resolve(
      FIXTURES_DIR,
      'workspace-root',
      'project-root',
    );

    const result = await loadConfig(
      {
        cwd: projectRoot,
      },
      {
        watchFolders: [
          path.join(FIXTURES_DIR, 'link-to-workspace-root'),
          path.join(FIXTURES_DIR, 'other-watched-folder'),
        ],
      },
    );

    let defaultConfig = await getDefaultConfig(projectRoot);
    defaultConfig = {
      ...defaultConfig,
      watchFolders: [
        // Project root has not been added to the watch folders, but symlinks
        // in watch folders have been resolved.
        path.join(FIXTURES_DIR, 'workspace-root'),
        path.join(FIXTURES_DIR, 'other-watched-folder'),
      ],
    };

    expect(prettyFormat.format(result)).toEqual(
      prettyFormat.format(defaultConfig),
    );
  });

  test('throws if the project root does not exist', async () => {
    cosmiconfig.setReturnNull(true);
    const projectRoot = path.resolve(FIXTURES_DIR, 'non-existent');
    await expect(() => loadConfig({cwd: projectRoot})).rejects.toThrowError(
      'metro-config: The given projectRoot does not exist or cannot be accessed: ' +
        projectRoot,
    );
  });

  test('throws if any watched folder does not exist', async () => {
    cosmiconfig.setReturnNull(true);
    const projectRoot = path.resolve(
      FIXTURES_DIR,
      'workspace-root',
      'project-root',
    );
    await expect(() =>
      loadConfig(
        {cwd: projectRoot},
        {watchFolders: [path.resolve(FIXTURES_DIR, 'non-existent')]},
      ),
    ).rejects.toThrowError(
      `metro-config: One or more watchFolders does not exist or cannot be accessed:\n  ` +
        path.resolve(FIXTURES_DIR, 'non-existent'),
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
