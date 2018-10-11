/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const sourceMapString = require('../sourceMapString');

const polyfill = {
  path: '/root/pre.js',
  getSource: () => Buffer.from('source pre'),
  output: [
    {
      type: 'js/script',
      data: {
        code: '__d(function() {/* code for polyfill */});',
        map: [],
      },
    },
  ],
};

const fooModule = {
  path: '/root/foo.js',
  dependencies: new Map([['./bar', 'bar']]),
  getSource: () => Buffer.from('source foo'),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for foo */});',
        map: [],
      },
    },
  ],
};

const barModule = {
  path: '/root/bar.js',
  dependencies: new Map(),
  getSource: () => Buffer.from('source bar'),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for bar */});',
        map: [],
      },
    },
  ],
};

it('should serialize a very simple bundle', () => {
  expect(
    JSON.parse(
      sourceMapString(
        [polyfill],
        {
          dependencies: new Map([['foo', fooModule], ['bar', barModule]]),
          entryPoints: ['foo'],
        },
        {
          excludesSource: false,
          processModuleFilter: module => true,
        },
      ),
    ),
  ).toEqual({
    version: 3,
    sources: ['/root/pre.js', '/root/foo.js', '/root/bar.js'],
    sourcesContent: ['source pre', 'source foo', 'source bar'],
    names: [],
    mappings: '',
  });
});

it('should not include the source of an asset', () => {
  const assetModule = {
    path: '/root/asset.jpg',
    dependencies: new Map(),
    getSource: () => {
      throw new Error('should not read the source of an asset');
    },
    output: [
      {
        type: 'js/module/asset',
        data: {
          code: '__d(function() {/* code for bar */});',
          map: [],
        },
      },
    ],
  };

  expect(
    JSON.parse(
      sourceMapString(
        [],
        {
          dependencies: new Map([['foo', fooModule], ['asset', assetModule]]),
          entryPoints: ['foo'],
        },
        {
          excludesSource: false,
          processModuleFilter: module => true,
        },
      ),
    ),
  ).toEqual({
    version: 3,
    sources: ['/root/foo.js', '/root/asset.jpg'],
    sourcesContent: ['source foo', ''],
    names: [],
    mappings: '',
  });
});
