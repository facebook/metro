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
  getSource: () => 'source pre',
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
  getSource: () => 'source foo',
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
  getSource: () => 'source bar',
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
