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

const getTransformCacheKeyFn = require('../getTransformCacheKeyFn');
const path = require('path');

describe('getTransformCacheKeyFn', () => {
  it('Should return always the same key for the same params', async () => {
    expect(
      getTransformCacheKeyFn({
        cacheVersion: '1.0',
        projectRoots: [__dirname],
        transformModulePath: path.resolve(__dirname, '../../transformer.js'),
      })(),
    ).toMatchSnapshot();
  });

  it('Should return a different key when the params change', async () => {
    const baseParams = {
      cacheVersion: '1.0',
      projectRoots: [__dirname],
      transformModulePath: path.resolve(__dirname, '../../transformer.js'),
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
        transformModulePath: path.resolve(
          __dirname,
          '../../../src/defaultTransform.js',
        ),
      },
    ];

    const baseCacheKey = getTransformCacheKeyFn(baseParams)();

    changedParams.forEach(params => {
      expect(getTransformCacheKeyFn(params)()).not.toEqual(baseCacheKey);
    });
  });
});
