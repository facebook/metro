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

jest.mock('../../../Assets');

const getAllFiles = require('../getAllFiles');

const {getAssetFiles} = require('../../../Assets');

describe('getOrderedDependencyPaths', () => {
  beforeEach(() => {
    getAssetFiles.mockImplementation(async path => [
      `${path}@2x`,
      `${path}@3x`,
    ]);
  });

  it('Should return all module dependencies correctly', async () => {
    const graph = {
      dependencies: new Map([
        [
          1,
          {
            path: '/tmp/1.js',
            output: [
              {
                type: 'js/module',
                data: {code: '//', lineCount: 1, map: [], functionMap: null},
              },
            ],
          },
        ],
        [
          2,
          {
            path: '/tmp/2.js',
            output: [
              {
                type: 'js/module',
                data: {code: '//', lineCount: 1, map: [], functionMap: null},
              },
            ],
          },
        ],
        [
          3,
          {
            path: '/tmp/3.js',
            output: [
              {
                type: 'js/module',
                data: {code: '//', lineCount: 1, map: [], functionMap: null},
              },
            ],
          },
        ],
        [
          4,
          {
            path: '/tmp/4.js',
            output: [
              {
                type: 'js/module',
                data: {code: '//', lineCount: 1, map: [], functionMap: null},
              },
            ],
          },
        ],
      ]),
    };

    expect(
      await getAllFiles(
        [
          {
            path: '/tmp/0.js',
            output: [
              {
                type: 'js/module',
                data: {code: '//', lineCount: 1, map: [], functionMap: null},
              },
            ],
          },
        ],
        graph,
        {
          processModuleFilter: () => true,
        },
      ),
    ).toEqual([
      '/tmp/0.js',
      '/tmp/1.js',
      '/tmp/2.js',
      '/tmp/3.js',
      '/tmp/4.js',
    ]);
  });

  it('Should add assets data dependencies correctly', async () => {
    const graph = {
      dependencies: new Map([
        [
          1,
          {
            path: '/tmp/1.js',
            output: [
              {
                type: 'js/module',
                data: {code: '//', lineCount: 1, map: [], functionMap: null},
              },
            ],
          },
        ],
        [
          2,
          {
            path: '/tmp/2.png',
            output: [
              {
                type: 'js/module/asset',
                data: {code: '//', lineCount: 1, map: [], functionMap: null},
              },
            ],
          },
        ],
        [
          3,
          {
            path: '/tmp/3.js',
            output: [
              {
                type: 'js/module',
                data: {code: '//', lineCount: 1, map: [], functionMap: null},
              },
            ],
          },
        ],
        [
          4,
          {
            path: '/tmp/4.png',
            output: [
              {
                type: 'js/module/asset',
                data: {code: '//', lineCount: 1, map: [], functionMap: null},
              },
            ],
          },
        ],
        [
          5,
          {
            path: '/tmp/5.js',
            output: [
              {
                type: 'js/module',
                data: {code: '//', lineCount: 1, map: [], functionMap: null},
              },
            ],
          },
        ],
      ]),
    };

    expect(
      await getAllFiles([], graph, {processModuleFilter: () => true}),
    ).toEqual([
      '/tmp/1.js',
      '/tmp/2.png@2x',
      '/tmp/2.png@3x',
      '/tmp/3.js',
      '/tmp/4.png@2x',
      '/tmp/4.png@3x',
      '/tmp/5.js',
    ]);

    expect(getAssetFiles.mock.calls).toEqual([
      ['/tmp/2.png', undefined],
      ['/tmp/4.png', undefined],
    ]);
  });
});
