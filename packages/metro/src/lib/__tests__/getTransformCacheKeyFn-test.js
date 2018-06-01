/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 * @flow
 */

'use strict';

jest.mock('../../../package.json', () => ({
  version: '1.0.0',
}));

const getTransformCacheKeyFn = require('../getTransformCacheKeyFn');

describe('getTransformCacheKeyFn', () => {
  it('Should return always the same key for the same params', async () => {
    expect(
      getTransformCacheKeyFn({
        asyncRequireModulePath: 'beep',
        cacheVersion: '1.0',
        dynamicDepsInPackages: 'arbitrary',
        projectRoots: [__dirname],
        transformModulePath: require.resolve('metro/src/defaultTransform.js'),
      })(),
    ).toMatchSnapshot();
  });

  it('Should return a different key when the params change', async () => {
    const baseParams = {
      asyncRequireModulePath: 'beep',
      cacheVersion: '1.0',
      dynamicDepsInPackages: 'arbitrary',
      projectRoots: [__dirname],
      transformModulePath: require.resolve('metro/src/defaultTransform.js'),
    };

    const changedParams = [
      {
        ...baseParams,
        cacheVersion: '1.1',
      },
      {
        ...baseParams,
        projectRoots: ['/foo'],
      },
      {
        ...baseParams,
        transformModulePath: require.resolve(
          'metro/src/reactNativeTransformer',
        ),
      },
    ];

    const baseCacheKey = getTransformCacheKeyFn(baseParams)();

    changedParams.forEach(params => {
      expect(getTransformCacheKeyFn(params)()).not.toEqual(baseCacheKey);
    });
  });
});
