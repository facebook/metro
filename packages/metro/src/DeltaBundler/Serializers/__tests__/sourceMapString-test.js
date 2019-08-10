/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
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
        lineCount: 1,
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
        lineCount: 1,
        map: [],
        functionMap: {names: ['<global>'], mappings: 'AAA'},
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
        excludesSource: false,
        processModuleFilter: module => true,
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
        excludesSource: false,
        processModuleFilter: module => true,
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
          lineCount: 1,
          map: [],
        },
      },
    ],
  };

  expect(
    JSON.parse(
      sourceMapString([fooModule, assetModule], {
        excludesSource: false,
        processModuleFilter: module => true,
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
