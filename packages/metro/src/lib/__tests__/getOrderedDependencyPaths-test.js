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

jest.mock('../../DeltaBundler/Serializers/Serializers');
jest.mock('../../Assets');

const getOrderedDependencyPaths = require('../getOrderedDependencyPaths');
const Serializers = require('../../DeltaBundler/Serializers/Serializers');

const {getAssetFiles} = require('../../Assets');

describe('getOrderedDependencyPaths', () => {
  const deltaBundler = {};

  beforeEach(() => {
    getAssetFiles.mockImplementation(async path => [
      `${path}@2x`,
      `${path}@3x`,
    ]);
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

    expect(await getOrderedDependencyPaths(deltaBundler, ['/tmp'], {})).toEqual(
      ['/tmp/1.js', '/tmp/2.js', '/tmp/3.js', '/tmp/4.js'],
    );
  });

  it('Should add assets data dependencies correctly', async () => {
    deltaBundler.getOptions = () => ({projectRoots: ['/root']});

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

    expect(await getOrderedDependencyPaths(deltaBundler, ['/tmp'], {})).toEqual(
      [
        '/tmp/1.js',
        '/tmp/2.png@2x',
        '/tmp/2.png@3x',
        '/tmp/3.js',
        '/tmp/4.png@2x',
        '/tmp/4.png@3x',
        '/tmp/5.js',
      ],
    );

    expect(getAssetFiles.mock.calls).toEqual([
      ['/tmp/2.png', undefined],
      ['/tmp/4.png', undefined],
    ]);
  });
});
