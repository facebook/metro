/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

jest
  .setMock('jest-worker', () => ({}))
  .setMock('../../JSTransformer/worker/minify')
  .mock('image-size')
  .mock('fs')
  .mock('os')
  .mock('assert')
  .mock('progress')
  .mock('../../node-haste/DependencyGraph')
  .mock('../../JSTransformer')
  .mock('../../Resolver')
  .mock('../../Logger')
  .mock('/path/to/transformer.js', () => ({}), {virtual: true});

var Bundler = require('../');
var Resolver = require('../../Resolver');
var defaults = require('../../defaults');
var sizeOf = require('image-size');
var fs = require('fs');
const os = require('os');
const path = require('path');

var commonOptions = {
  allowBundleUpdates: false,
  assetExts: defaults.assetExts,
  assetRegistryPath: '/AssetRegistry.js',
  cacheVersion: 'smth',
  enableBabelRCLookup: true,
  extraNodeModules: {},
  platforms: defaults.platforms,
  resetCache: false,
  sourceExts: defaults.sourceExts,
  transformModulePath: '/path/to/transformer.js',
  watch: false,
};

describe('Bundler', function() {
  let bundler;
  let assetServer;
  let projectRoots;

  beforeEach(function() {
    os.cpus.mockReturnValue({length: 1});
    // local directory on purpose, because it should not actually write
    // anything to the disk during a unit test!
    os.tmpDir.mockReturnValue(path.join(__dirname));

    projectRoots = ['/root'];

    Resolver.load = jest
      .fn()
      .mockImplementation(opts => Promise.resolve(new Resolver(opts)));

    fs.__setMockFilesystem({
      path: {to: {'transformer.js': ''}},
    });

    fs.statSync.mockImplementation(function() {
      return {
        isDirectory: () => true,
      };
    });

    assetServer = {
      getAssetData: jest.fn(),
    };

    bundler = new Bundler({
      ...commonOptions,
      projectRoots,
      assetServer,
    });

    sizeOf.mockImplementation(function(path, cb) {
      cb(null, {width: 50, height: 100});
    });
  });

  it('allows overriding the platforms array', () => {
    expect(bundler._opts.platforms).toEqual([
      'ios',
      'android',
      'windows',
      'web',
    ]);
    const b = new Bundler({
      ...commonOptions,
      projectRoots,
      assetServer,
      platforms: ['android', 'vr'],
    });
    expect(b._opts.platforms).toEqual(['android', 'vr']);
  });

  it('.generateAssetObjAndCode', async () => {
    const mockAsset = {
      __packager_asset: true,
      fileSystemLocation: '/root/img',
      scales: [1, 2, 3],
      files: [
        '/root/img/img.png',
        '/root/img/img@2x.png',
        '/root/img/img@3x.png',
      ],
      hash: 'i am a hash',
      height: 100,
      httpServerLocation: '/assets/img',
      name: 'img',
      type: 'png',
      width: 50,
    };

    assetServer.getAssetData.mockImplementation(() =>
      Promise.resolve(mockAsset),
    );

    jest.mock(
      'mockPlugin1',
      () => {
        return asset => {
          asset.extraReverseHash = asset.hash
            .split('')
            .reverse()
            .join('');
          return asset;
        };
      },
      {virtual: true},
    );

    jest.mock(
      'asyncMockPlugin2',
      () => {
        return asset => {
          expect(asset.extraReverseHash).toBeDefined();
          return new Promise(resolve => {
            asset.extraPixelCount = asset.width * asset.height;
            resolve(asset);
          });
        };
      },
      {virtual: true},
    );

    expect(
      await bundler.generateAssetObjAndCode(
        {},
        ['mockPlugin1', 'asyncMockPlugin2'],
        'ios',
      ),
    ).toMatchSnapshot();
  });
});
