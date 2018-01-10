/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+js_foundation
 * @format
 */
'use strict';

jest
  .mock('fs')
  .mock('assert')
  .mock('progress')
  .mock('../DeltaCalculator')
  .mock('../../node-haste/DependencyGraph')
  .mock('../../JSTransformer')
  .mock('/root/to/something.js', () => ({}), {virtual: true})
  .mock('/path/to/transformer.js', () => ({}), {virtual: true});

const fs = require('fs');

const Bundler = require('../../Bundler');
const DeltaTransformer = require('../DeltaTransformer');
const DependencyGraph = require('../../node-haste/DependencyGraph');

const defaults = require('../../defaults');

const bundlerOptions = {
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
  projectRoots: ['/root'],
  assetServer: {
    getAssetData: jest.fn(),
  },
};

describe('DeltaTransformer', () => {
  let bundler;
  beforeEach(() => {
    DependencyGraph.load = jest
      .fn()
      .mockImplementation(opts => Promise.resolve(new DependencyGraph(opts)));

    fs.__setMockFilesystem({
      path: {to: {'transformer.js': ''}},
      root: {to: {'something.js': ''}},
    });

    fs.statSync.mockImplementation(function() {
      return {
        isDirectory: () => true,
      };
    });

    bundler = new Bundler(bundlerOptions);
  });

  it('should allow setting a custom module ID factory', async () => {
    const bundlerOptions = {
      isolateModuleIDs: true,
      createModuleIdFactory: createPlus10000ModuleIdFactory,
    };

    const deltaTransformer = await DeltaTransformer.create(
      bundler,
      {},
      bundlerOptions,
    );

    expect(deltaTransformer._getModuleId('test/path')).toBe(10000);
  });
});

function createPlus10000ModuleIdFactory(): (path: string) => number {
  const fileToIdMap: Map<string, number> = new Map();
  let nextId = 10000;
  return (path: string) => {
    let id = fileToIdMap.get(path);
    if (typeof id !== 'number') {
      id = nextId++;
      fileToIdMap.set(path, id);
    }
    return id;
  };
}
