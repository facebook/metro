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
  .setMock('metro-minify-uglify')
  .mock('image-size')
  .mock('fs', () => new (require('metro-memory-fs'))())
  .mock('os')
  .mock('assert')
  .mock('progress')
  .mock('../../node-haste/DependencyGraph')
  .mock('../../JSTransformer')
  .mock('metro-core')
  .mock('/path/to/transformer.js', () => ({}), {virtual: true});

var Bundler = require('../');
var defaults = require('../../defaults');
var sizeOf = require('image-size');
var fs = require('fs');
const os = require('os');
const path = require('path');
const mkdirp = require('mkdirp');

var commonOptions = {
  allowBundleUpdates: false,
  assetExts: defaults.assetExts,
  assetRegistryPath: '/AssetRegistry.js',
  cacheStores: [],
  cacheVersion: 'smth',
  enableBabelRCLookup: true,
  extraNodeModules: {},
  minifierPath: defaults.DEFAULT_METRO_MINIFIER_PATH,
  platforms: defaults.platforms,
  postMinifyProcess: e => e,
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

    mkdirp.sync('/path/to');
    mkdirp.sync('/root');
    fs.writeFileSync('/path/to/transformer.js', '');

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

  it('should minify code using the Transformer', async () => {
    const code = 'arbitrary(code)';
    const id = 'arbitrary.js';

    const minifiedCode = 'minified(code)';
    const minifiedMap = {
      version: 3,
      file: ['minified'],
      sources: [],
      mappings: '',
    };

    bundler._transformer.minify = jest
      .fn()
      .mockReturnValue(Promise.resolve({code: minifiedCode, map: minifiedMap}));

    const result = await bundler.minifyModule(id, code, []);

    expect(result.code).toEqual(minifiedCode);
    expect(result.map).toEqual([]);
  });
});
