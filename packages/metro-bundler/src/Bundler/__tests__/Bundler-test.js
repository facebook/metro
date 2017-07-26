/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */
'use strict';

jest
  .setMock('worker-farm', () => () => undefined)
  .setMock('../../worker-farm', () => () => undefined)
  .setMock('uglify-js')
  .mock('image-size')
  .mock('fs')
  .mock('os')
  .mock('assert')
  .mock('progress')
  .mock('../../node-haste/DependencyGraph')
  .mock('../../JSTransformer')
  .mock('../../Resolver')
  .mock('../Bundle')
  .mock('../HMRBundle')
  .mock('../../Logger')
  .mock('/path/to/transformer.js', () => ({}), {virtual: true})
  ;

var Bundler = require('../');
var Resolver = require('../../Resolver');
var defaults = require('../../defaults');
var sizeOf = require('image-size');
var fs = require('fs');
const os = require('os');
const path = require('path');

const {any, objectContaining} = expect;


var commonOptions = {
  allowBundleUpdates: false,
  assetExts: defaults.assetExts,
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

  function createModule({
    path,
    id,
    dependencies,
    isAsset,
    isJSON,
    isPolyfill,
    resolution,
  }) {
    return {
      path,
      resolution,
      getDependencies: () => Promise.resolve(dependencies),
      getName: () => Promise.resolve(id),
      isJSON: () => isJSON,
      isAsset: () => isAsset,
      isPolyfill: () => isPolyfill,
      read: () => ({
        code: 'arbitrary',
        source: 'arbitrary',
      }),
    };
  }

  var getDependencies;
  var getModuleSystemDependencies;
  var bundler;
  var assetServer;
  var modules;
  var projectRoots;

  beforeEach(function() {
    os.cpus.mockReturnValue({length: 1});
    // local directory on purpose, because it should not actually write
    // anything to the disk during a unit test!
    os.tmpDir.mockReturnValue(path.join(__dirname));

    getDependencies = jest.fn();
    getModuleSystemDependencies = jest.fn();
    projectRoots = ['/root'];

    Resolver.mockImplementation(function() {
      return {
        getDependencies,
        getModuleSystemDependencies,
      };
    });
    Resolver.load = jest.fn().mockImplementation(opts => Promise.resolve(new Resolver(opts)));

    fs.__setMockFilesystem({
      'path': {'to': {'transformer.js': ''}},
    });

    fs.statSync.mockImplementation(function() {
      return {
        isDirectory: () => true,
      };
    });

    fs.readFile.mockImplementation(function(file, callback) {
      callback(null, '{"json":true}');
    });

    assetServer = {
      getAssetData: jest.fn(),
    };

    bundler = new Bundler({
      ...commonOptions,
      projectRoots,
      assetServer,
    });

    modules = [
      createModule({id: 'foo', path: '/root/foo.js', dependencies: []}),
      createModule({id: 'bar', path: '/root/bar.js', dependencies: []}),
      createModule({
        id: 'new_image.png',
        path: '/root/img/new_image.png',
        isAsset: true,
        resolution: 2,
        dependencies: [],
      }),
      createModule({
        id: 'package/file.json',
        path: '/root/file.json',
        isJSON: true,
        dependencies: [],
      }),
    ];

    getDependencies.mockImplementation((main, options, transformOptions) =>
      Promise.resolve({
        mainModuleId: 'foo',
        dependencies: modules,
        options: transformOptions,
        getModuleId: () => 123,
        getResolvedDependencyPairs: () => [],
      })
    );

    getModuleSystemDependencies.mockImplementation(function() {
      return [];
    });

    sizeOf.mockImplementation(function(path, cb) {
      cb(null, {width: 50, height: 100});
    });
  });

  it('gets the list of dependencies from the resolver', function() {
    const entryFile = '/root/foo.js';
    return bundler.getDependencies({entryFile, recursive: true}).then(() =>
      // jest calledWith does not support jasmine.any
      expect(getDependencies.mock.calls[0].slice(0, -2)).toEqual([
        '/root/foo.js',
        {dev: true, platform: undefined, recursive: true},
        {
          preloadedModules: undefined,
          ramGroups: undefined,
          transformer: {
            dev: true,
            minify: false,
            platform: undefined,
            transform: {
              enableBabelRCLookup: true,
              dev: true,
              generateSourceMaps: false,
              hot: false,
              inlineRequires: false,
              platform: undefined,
              projectRoot: projectRoots[0],
            },
          },
        },
      ])
    );
  });

  it('allows overriding the platforms array', () => {
    expect(bundler._opts.platforms).toEqual(['ios', 'android', 'windows', 'web']);
    const b = new Bundler({
      ...commonOptions,
      projectRoots,
      assetServer,
      platforms: ['android', 'vr'],
    });
    expect(b._opts.platforms).toEqual(['android', 'vr']);
  });

  describe('.bundle', () => {
    const mockAsset = {
      scales: [1, 2, 3],
      files: [
        '/root/img/img.png',
        '/root/img/img@2x.png',
        '/root/img/img@3x.png',
      ],
      hash: 'i am a hash',
      name: 'img',
      type: 'png',
    };

    beforeEach(() => {
      assetServer.getAssetData
        .mockImplementation(() => Promise.resolve(mockAsset));
    });

    it('creates a bundle', function() {
      return bundler.bundle({
        entryFile: '/root/foo.js',
        runBeforeMainModule: [],
        runModule: true,
        sourceMapUrl: 'source_map_url',
      }).then(bundle => {
        const ithAddedModule = i => bundle.addModule.mock.calls[i][2].path;

        expect(ithAddedModule(0)).toEqual('/root/foo.js');
        expect(ithAddedModule(1)).toEqual('/root/bar.js');
        expect(ithAddedModule(2)).toEqual('/root/img/new_image.png');
        expect(ithAddedModule(3)).toEqual('/root/file.json');

        expect(bundle.finalize.mock.calls[0]).toEqual([{
          runModule: true,
          runBeforeMainModule: [],
          allowUpdates: false,
        }]);

        expect(bundle.addAsset.mock.calls[0]).toEqual([{
          __packager_asset: true,
          fileSystemLocation: '/root/img',
          httpServerLocation: '/assets/img',
          width: 50,
          height: 100,
          scales: [1, 2, 3],
          files: [
            '/root/img/img.png',
            '/root/img/img@2x.png',
            '/root/img/img@3x.png',
          ],
          hash: 'i am a hash',
          name: 'img',
          type: 'png',
        }]);

        // TODO(amasad) This fails with 0 != 5 in OSS
        //expect(ProgressBar.prototype.tick.mock.calls.length).toEqual(modules.length);
      });
    });

    it('loads and runs asset plugins', function() {
      jest.mock('mockPlugin1', () => {
        return asset => {
          asset.extraReverseHash = asset.hash.split('').reverse().join('');
          return asset;
        };
      }, {virtual: true});

      jest.mock('asyncMockPlugin2', () => {
        return asset => {
          expect(asset.extraReverseHash).toBeDefined();
          return new Promise(resolve => {
            asset.extraPixelCount = asset.width * asset.height;
            resolve(asset);
          });
        };
      }, {virtual: true});

      return bundler.bundle({
        entryFile: '/root/foo.js',
        runBeforeMainModule: [],
        runModule: true,
        sourceMapUrl: 'source_map_url',
        assetPlugins: ['mockPlugin1', 'asyncMockPlugin2'],
      }).then(bundle => {
        expect(bundle.addAsset.mock.calls[0]).toEqual([{
          __packager_asset: true,
          fileSystemLocation: '/root/img',
          httpServerLocation: '/assets/img',
          width: 50,
          height: 100,
          scales: [1, 2, 3],
          files: [
            '/root/img/img.png',
            '/root/img/img@2x.png',
            '/root/img/img@3x.png',
          ],
          hash: 'i am a hash',
          name: 'img',
          type: 'png',
          extraReverseHash: 'hsah a ma i',
          extraPixelCount: 5000,
        }]);
      });
    });

    it('calls the module post-processing function', () => {
      const postProcessModules = jest.fn().mockImplementation((ms, e) => ms);

      const b = new Bundler({
        ...commonOptions,
        postProcessModules,
        projectRoots,
        assetServer,
      });

      const dev = false;
      const minify = true;
      const platform = 'arbitrary';

      const entryFile = '/root/foo.js';
      return b.bundle({
        dev,
        entryFile,
        minify,
        platform,
        runBeforeMainModule: [],
        runModule: true,
        sourceMapUrl: 'source_map_url',
      }).then(() => {
        expect(postProcessModules)
          .toBeCalledWith(
            modules.map(x => objectContaining({
              name: any(String),
              id: any(Number),
              code: any(String),
              sourceCode: any(String),
              sourcePath: x.path,
              meta: any(Object),
              polyfill: !!x.isPolyfill(),
            })),
            entryFile,
            {dev, minify, platform},
          );
      });
    });

    it('respects the order of modules returned by the post-processing function', () => {
      const postProcessModules = jest.fn().mockImplementation((ms, e) => ms.reverse());

      const b = new Bundler({
        ...commonOptions,
        postProcessModules,
        projectRoots,
        assetServer,
      });

      const entryFile = '/root/foo.js';
      return b.bundle({
        entryFile,
        runBeforeMainModule: [],
        runModule: true,
        sourceMapUrl: 'source_map_url',
      }).then(bundle => {
        const ithAddedModule = i => bundle.addModule.mock.calls[i][2].path;

        [
          '/root/file.json',
          '/root/img/new_image.png',
          '/root/bar.js',
          '/root/foo.js',
        ].forEach((path, ix) => expect(ithAddedModule(ix)).toEqual(path));
      });
    });
  });

  describe('.getOrderedDependencyPaths', () => {
    beforeEach(() => {
      assetServer.getAssetData.mockImplementation(function(relPath) {
        if (relPath === 'img/new_image.png') {
          return Promise.resolve({
            scales: [1, 2, 3],
            files: [
              '/root/img/new_image.png',
              '/root/img/new_image@2x.png',
              '/root/img/new_image@3x.png',
            ],
            hash: 'i am a hash',
            name: 'img',
            type: 'png',
          });
        } else if (relPath === 'img/new_image2.png') {
          return Promise.resolve({
            scales: [1, 2, 3],
            files: [
              '/root/img/new_image2.png',
              '/root/img/new_image2@2x.png',
              '/root/img/new_image2@3x.png',
            ],
            hash: 'i am a hash',
            name: 'img',
            type: 'png',
          });
        }

        throw new Error('unknown image ' + relPath);
      });
    });

    it('should get the concrete list of all dependency files', () => {
      modules.push(
        createModule({
          id: 'new_image2.png',
          path: '/root/img/new_image2.png',
          isAsset: true,
          resolution: 2,
          dependencies: [],
        }),
      );

      return bundler.getOrderedDependencyPaths('/root/foo.js', true)
        .then(paths => expect(paths).toEqual([
          '/root/foo.js',
          '/root/bar.js',
          '/root/img/new_image.png',
          '/root/img/new_image@2x.png',
          '/root/img/new_image@3x.png',
          '/root/file.json',
          '/root/img/new_image2.png',
          '/root/img/new_image2@2x.png',
          '/root/img/new_image2@3x.png',
        ]));
    });
  });
});
