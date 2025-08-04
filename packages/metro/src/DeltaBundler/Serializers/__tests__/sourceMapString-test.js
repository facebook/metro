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

import type {Module} from '../../types';

import CountingSet from '../../../lib/CountingSet';

const {
  sourceMapString,
  sourceMapStringNonBlocking,
} = require('../sourceMapString');

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
        data: {
          data: {asyncType: null, isESMImport: false, locs: [], key: './bar'},
          name: './bar',
        },
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

describe.each([sourceMapString, sourceMapStringNonBlocking])(
  '%p',
  sourceMapStringImpl => {
    test('should serialize a very simple bundle', async () => {
      expect(
        JSON.parse(
          await sourceMapStringImpl([polyfill, fooModule, barModule], {
            excludeSource: false,
            processModuleFilter: module => true,
            shouldAddToIgnoreList: module => false,
            getSourceUrl: null,
          }),
        ),
      ).toEqual({
        version: 3,
        sources: ['/root/pre.js', '/root/foo.js', '/root/bar.js'],
        sourcesContent: ['source pre', 'source foo', 'source bar'],
        x_facebook_sources: [
          null,
          [{names: ['<global>'], mappings: 'AAA'}],
          null,
        ],
        names: [],
        mappings: '',
      });
    });

    test('modules should appear in their original order', async () => {
      expect(
        JSON.parse(
          await sourceMapStringImpl([polyfill, barModule, fooModule], {
            excludeSource: false,
            processModuleFilter: module => true,
            shouldAddToIgnoreList: module => false,
            getSourceUrl: null,
          }),
        ),
      ).toEqual({
        version: 3,
        sources: ['/root/pre.js', '/root/bar.js', '/root/foo.js'],
        sourcesContent: ['source pre', 'source bar', 'source foo'],
        x_facebook_sources: [
          null,
          null,
          [{names: ['<global>'], mappings: 'AAA'}],
        ],
        names: [],
        mappings: '',
      });
    });

    test('should not include the source of an asset', async () => {
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
          await sourceMapStringImpl([fooModule, assetModule], {
            excludeSource: false,
            processModuleFilter: module => true,
            shouldAddToIgnoreList: module => false,
            getSourceUrl: null,
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

    test('should emit x_google_ignoreList based on shouldAddToIgnoreList', async () => {
      expect(
        JSON.parse(
          await sourceMapStringImpl([polyfill, fooModule, barModule], {
            excludeSource: false,
            processModuleFilter: module => true,
            shouldAddToIgnoreList: module => true,
            getSourceUrl: null,
          }),
        ),
      ).toEqual({
        version: 3,
        sources: ['/root/pre.js', '/root/foo.js', '/root/bar.js'],
        sourcesContent: ['source pre', 'source foo', 'source bar'],
        x_facebook_sources: [
          null,
          [{names: ['<global>'], mappings: 'AAA'}],
          null,
        ],
        names: [],
        mappings: '',
        x_google_ignoreList: [0, 1, 2],
      });
    });
  },
);
