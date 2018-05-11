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

const sourceMapString = require('../sourceMapString');

const polyfill = {
  path: '/root/pre.js',
  output: {
    type: 'js/script',
    code: '__d(function() {/* code for polyfill */});',
    map: [],
    source: 'source pre',
  },
};

const fooModule = {
  path: '/root/foo.js',
  dependencies: new Map([['./bar', 'bar']]),
  output: {
    type: 'js/module',
    code: '__d(function() {/* code for foo */});',
    map: [],
    source: 'source foo',
  },
};

const barModule = {
  path: '/root/bar.js',
  dependencies: new Map(),
  output: {
    type: 'js/module',
    code: '__d(function() {/* code for bar */});',
    map: [],
    source: 'source bar',
  },
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
        {excludesSource: false},
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
