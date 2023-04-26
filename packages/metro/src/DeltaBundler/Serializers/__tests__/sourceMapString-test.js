/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

'use strict';

import type {Module} from '../../types.flow';

import CountingSet from '../../../lib/CountingSet';

const sourceMapString = require('../sourceMapString');

const polyfill: Module<> = {
  path: '/root/pre.js',
  dependencies: new Map(),
  inverseDependencies: new CountingSet(),
  getSource: () => Buffer.from('source pre'),
  output: [
    {
      type: 'js/script',
      data: {
        code: '__d(function() {/* code for polyfill */});',
        lineCount: 1,
        map: [],
      },
    },
  ],
};

const fooModule: Module<> = {
  path: '/root/foo.js',
  dependencies: new Map([
    [
      './bar',
      {
        absolutePath: '/root/bar.js',
        data: {data: {asyncType: null, locs: [], key: './bar'}, name: './bar'},
      },
    ],
  ]),
  inverseDependencies: new CountingSet(['/root/pre.js']),
  getSource: () => Buffer.from('source foo'),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for foo */});',
        lineCount: 1,
        map: [],
        functionMap: {names: ['<global>'], mappings: 'AAA'},
      },
    },
  ],
};

const barModule: Module<> = {
  path: '/root/bar.js',
  dependencies: new Map(),
  inverseDependencies: new CountingSet(['/root/foo.js']),
  getSource: () => Buffer.from('source bar'),
  output: [
    {
      type: 'js/module',
      data: {
        code: '__d(function() {/* code for bar */});',
        lineCount: 1,
        map: [],
      },
    },
  ],
};

it('should serialize a very simple bundle', () => {
  expect(
    JSON.parse(
      sourceMapString([polyfill, fooModule, barModule], {
        excludeSource: false,
        processModuleFilter: module => true,
        shouldAddToIgnoreList: module => false,
      }),
    ),
  ).toEqual({
    version: 3,
    sources: ['/root/pre.js', '/root/foo.js', '/root/bar.js'],
    sourcesContent: ['source pre', 'source foo', 'source bar'],
    x_facebook_sources: [null, [{names: ['<global>'], mappings: 'AAA'}], null],
    names: [],
    mappings: '',
  });
});

it('modules should appear in their original order', () => {
  expect(
    JSON.parse(
      sourceMapString([polyfill, barModule, fooModule], {
        excludeSource: false,
        processModuleFilter: module => true,
        shouldAddToIgnoreList: module => false,
      }),
    ),
  ).toEqual({
    version: 3,
    sources: ['/root/pre.js', '/root/bar.js', '/root/foo.js'],
    sourcesContent: ['source pre', 'source bar', 'source foo'],
    x_facebook_sources: [null, null, [{names: ['<global>'], mappings: 'AAA'}]],
    names: [],
    mappings: '',
  });
});

it('should not include the source of an asset', () => {
  const assetModule: Module<> = {
    path: '/root/asset.jpg',
    dependencies: new Map(),
    inverseDependencies: new CountingSet(),
    getSource: () => {
      throw new Error('should not read the source of an asset');
    },
    output: [
      {
        type: 'js/module/asset',
        data: {
          code: '__d(function() {/* code for bar */});',
          lineCount: 1,
          map: [],
        },
      },
    ],
  };

  expect(
    JSON.parse(
      sourceMapString([fooModule, assetModule], {
        excludeSource: false,
        processModuleFilter: module => true,
        shouldAddToIgnoreList: module => false,
      }),
    ),
  ).toEqual({
    version: 3,
    sources: ['/root/foo.js', '/root/asset.jpg'],
    sourcesContent: ['source foo', ''],
    x_facebook_sources: [[{names: ['<global>'], mappings: 'AAA'}], null],
    names: [],
    mappings: '',
  });
});

it('should emit x_google_ignoreList based on shouldAddToIgnoreList', () => {
  expect(
    JSON.parse(
      sourceMapString([polyfill, fooModule, barModule], {
        excludeSource: false,
        processModuleFilter: module => true,
        shouldAddToIgnoreList: module => true,
      }),
    ),
  ).toEqual({
    version: 3,
    sources: ['/root/pre.js', '/root/foo.js', '/root/bar.js'],
    sourcesContent: ['source pre', 'source foo', 'source bar'],
    x_facebook_sources: [null, [{names: ['<global>'], mappings: 'AAA'}], null],
    names: [],
    mappings: '',
    x_google_ignoreList: [0, 1, 2],
  });
});
