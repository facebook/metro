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

jest.mock('../../../Assets');

const getAssets = require('../getAssets');

const {getAssetData} = require('../../../Assets');

beforeEach(() => {
  getAssetData.mockImplementation(async (path, localPath) => ({
    path,
    localPath,
  }));
});

it('should return the bundle assets', async () => {
  const graph = {
    dependencies: new Map([
      ['/tmp/1.js', {path: '/tmp/1.js', output: [{type: 'js/module'}]}],
      ['/tmp/2.js', {path: '/tmp/2.js', output: [{type: 'js/module'}]}],
      ['/tmp/3.png', {path: '/tmp/3.png', output: [{type: 'js/module/asset'}]}],
      ['/tmp/4.js', {path: '/tmp/2.js', output: [{type: 'js/module'}]}],
      ['/tmp/5.mov', {path: '/tmp/5.mov', output: [{type: 'js/module/asset'}]}],
    ]),
  };

  expect(await getAssets(graph, {projectRoots: ['/tmp']})).toEqual([
    {path: '/tmp/3.png', localPath: '3.png'},
    {path: '/tmp/5.mov', localPath: '5.mov'},
  ]);
});
