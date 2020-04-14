/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

jest
  .setMock('jest-worker', () => ({}))
  .mock('fs', () => new (require('metro-memory-fs'))())
  .mock('assert')
  .mock('../getTransformCacheKey', () => () => 'hash')
  .mock('../WorkerFarm')
  .mock('/path/to/transformer.js', () => ({}), {virtual: true});

var Transformer = require('../Transformer');
var {getDefaultValues} = require('metro-config/src/defaults');
var {mergeConfig} = require('metro-config/src/loadConfig');
var fs = require('fs');
const mkdirp = require('mkdirp');

describe('Transformer', function() {
  let watchFolders;
  let projectRoot;
  let commonOptions;
  const getSha1 = jest.fn(() => '0123456789012345678901234567890123456789');

  beforeEach(function() {
    const baseConfig = {
      resolver: {
        extraNodeModules: {},
        resolverMainFields: [],
      },
      transformer: {
        assetRegistryPath: '/AssetRegistry.js',
        enableBabelRCLookup: true,
        postMinifyProcess: e => e,
      },
      cacheStores: [],
      cacheVersion: 'smth',
      projectRoot: '/root',
      resetCache: false,
      transformerPath: '/path/to/transformer.js',
      watchFolders: ['/root'],
    };

    commonOptions = mergeConfig(getDefaultValues('/'), baseConfig);

    projectRoot = '/root';
    watchFolders = [projectRoot];

    mkdirp.sync('/path/to');
    mkdirp.sync('/root');
    fs.writeFileSync('/path/to/transformer.js', '');
  });

  it('uses new cache layers when transforming if requested to do so', async () => {
    const get = jest.fn();
    const set = jest.fn();

    const transformerInstance = new Transformer(
      {
        ...commonOptions,
        cacheStores: [{get, set}],
        watchFolders,
      },
      getSha1,
    );

    require('../WorkerFarm').prototype.transform.mockReturnValue({
      sha1: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      result: {},
    });

    await transformerInstance.transformFile('./foo.js', {});

    // We got the SHA-1 of the file from the dependency graph.
    expect(getSha1).toBeCalledWith('./foo.js');

    // Only one get, with the original SHA-1.
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0].toString('hex')).toMatch(
      '0123456789012345678901234567890123456789',
    );

    // Only one set, with the *modified* SHA-1. This happens when the file gets
    // modified between querying the caches and saving.
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0].toString('hex')).toMatch(
      'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    );

    // But, the common part of the key remains the same.
    expect(get.mock.calls[0][0].toString('hex').substr(0, 32)).toBe(
      set.mock.calls[0][0].toString('hex').substr(0, 32),
    );
  });
});
