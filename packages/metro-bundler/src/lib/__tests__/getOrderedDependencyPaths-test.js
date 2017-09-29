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

jest.mock('../../DeltaBundler/Serializers');

const getOrderedDependencyPaths = require('../getOrderedDependencyPaths');
const Serializers = require('../../DeltaBundler/Serializers');

describe('getOrderedDependencyPaths', () => {
  const assetsServer = {
    getAssetData: jest.fn(),
  };
  const deltaBundler = {};

  beforeEach(() => {
    assetsServer.getAssetData.mockImplementation(async path => ({
      files: [`${path}@2x`, `${path}@3x`],
    }));
  });

  it('Should return all module dependencies correctly', async () => {
    Serializers.getAllModules.mockReturnValue(
      Promise.resolve(
        new Map([
          [1, {path: '/tmp/1.js'}],
          [2, {path: '/tmp/2.js'}],
          [3, {path: '/tmp/3.js'}],
          [4, {path: '/tmp/4.js'}],
        ]),
      ),
    );

    expect(
      await getOrderedDependencyPaths(deltaBundler, assetsServer, ['/tmp'], {}),
    ).toEqual(['/tmp/1.js', '/tmp/2.js', '/tmp/3.js', '/tmp/4.js']);
  });

  it('Should add assets data dependencies correctly', async () => {
    Serializers.getAllModules.mockReturnValue(
      Promise.resolve(
        new Map([
          [1, {path: '/tmp/1.js'}],
          [2, {path: '/tmp/2.png', type: 'asset'}],
          [3, {path: '/tmp/3.js'}],
          [4, {path: '/tmp/4.png', type: 'asset'}],
          [5, {path: '/tmp/5.js'}],
        ]),
      ),
    );

    expect(
      await getOrderedDependencyPaths(deltaBundler, assetsServer, ['/tmp'], {}),
    ).toEqual([
      '/tmp/1.js',
      '2.png@2x',
      '2.png@3x',
      '/tmp/3.js',
      '4.png@2x',
      '4.png@3x',
      '/tmp/5.js',
    ]);
  });
});
