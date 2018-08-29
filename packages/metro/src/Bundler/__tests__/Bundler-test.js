/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

jest
  .setMock('jest-worker', () => ({}))
  .mock('fs', () => new (require('metro-memory-fs'))())
  .mock('os')
  .mock('assert')
  .mock('progress')
  .mock('../../lib/getTransformCacheKeyFn', () => () => () => 'hash')
  .mock('../../node-haste/DependencyGraph')
  .mock('../../JSTransformer')
  .mock('metro-core')
  .mock('/path/to/transformer.js', () => ({}), {virtual: true});

var Bundler = require('../');
var {getDefaultValues} = require('metro-config/src/defaults');
var {mergeConfig} = require('metro-config/src/loadConfig');
var fs = require('fs');
const os = require('os');
const path = require('path');
const mkdirp = require('mkdirp');
const Module = require('../../node-haste/Module');

describe('Bundler', function() {
  let watchFolders;
  let projectRoot;
  let commonOptions;

  beforeEach(function() {
    os.cpus.mockReturnValue({length: 1});
    os.tmpdir.mockReturnValue('/tmp');
    // local directory on purpose, because it should not actually write
    // anything to the disk during a unit test!
    os.tmpDir.mockReturnValue(path.join(__dirname));

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
      watch: false,
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

    const bundlerInstance = new Bundler({
      ...commonOptions,
      cacheStores: [{get, set}],
      watchFolders,
    });

    const depGraph = {
      getSha1: jest.fn(() => '0123456789012345678901234567890123456789'),
    };

    jest.spyOn(bundlerInstance, 'getDependencyGraph').mockImplementation(() => {
      return new Promise(resolve => {
        resolve(depGraph);
      });
    });

    const module = new Module('/root/foo.js');

    require('../../JSTransformer').prototype.transform.mockReturnValue({
      sha1: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      result: {},
    });

    await bundlerInstance.transformFile(module.path, {transformOptions: {}});

    // We got the SHA-1 of the file from the dependency graph.
    expect(depGraph.getSha1).toBeCalledWith('/root/foo.js');

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
