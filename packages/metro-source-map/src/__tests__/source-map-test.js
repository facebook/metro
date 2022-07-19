/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+js_symbolication
 * @flow strict-local
 * @format
 */

'use strict';

const Generator = require('../Generator');
const {
  fromRawMappings,
  toBabelSegments,
  toSegmentTuple,
} = require('../source-map');

describe('flattening mappings / compacting', () => {
  it('flattens simple mappings', () => {
    expect(toSegmentTuple({generated: {line: 12, column: 34}})).toEqual([
      12, 34,
    ]);
  });

  it('flattens mappings with a source location', () => {
    expect(
      toSegmentTuple({
        generated: {column: 34, line: 12},
        original: {column: 78, line: 56},
      }),
    ).toEqual([12, 34, 56, 78]);
  });

  it('flattens mappings with a source location and a symbol name', () => {
    expect(
      toSegmentTuple({
        generated: {column: 34, line: 12},
        name: 'arbitrary',
        original: {column: 78, line: 56},
      }),
    ).toEqual([12, 34, 56, 78, 'arbitrary']);
  });
});

describe('build map from raw mappings', () => {
  it('returns a `Generator` instance', () => {
    expect(fromRawMappings([])).toBeInstanceOf(Generator);
  });

  it('returns a working source map containing all mappings', () => {
    const input = [
      {
        code: lines(11),
        functionMap: {names: ['<global>'], mappings: 'AAA'},
        map: [
          [1, 2],
          [3, 4, 5, 6, 'apples'],
          [7, 8, 9, 10],
          [11, 12, 13, 14, 'pears'],
        ],
        source: 'code1',
        path: 'path1',
      },
      {
        code: lines(3),
        functionMap: {names: ['<global>'], mappings: 'AAA'},
        map: [
          [1, 2],
          [3, 4, 15, 16, 'bananas'],
        ],
        source: 'code2',
        path: 'path2',
      },
      {
        code: lines(23),
        functionMap: null,
        map: [
          [11, 12],
          [13, 14, 15, 16, 'bananas'],
          [17, 18, 19, 110],
          [21, 112, 113, 114, 'pears'],
        ],
        source: 'code3',
        path: 'path3',
      },
    ];

    expect(fromRawMappings(input).toMap()).toEqual({
      mappings:
        'E;;IAIMA;;;;QAII;;;;YAIIC;E;;ICEEC;;;;;;;;;;;Y;;cCAAA;;;;kBAI8F;;;;gHA8FID',
      names: ['apples', 'pears', 'bananas'],
      sources: ['path1', 'path2', 'path3'],
      sourcesContent: ['code1', 'code2', 'code3'],
      x_facebook_sources: [
        [{names: ['<global>'], mappings: 'AAA'}],
        [{names: ['<global>'], mappings: 'AAA'}],
        null,
      ],
      version: 3,
    });
  });

  describe('convert a sourcemap into raw mappings', () => {
    expect(
      toBabelSegments({
        mappings:
          'E;;IAIMA;;;;QAII;;;;YAIIC;E;;ICEEC;;;;;;;;;;;Y;;cCAAA;;;;kBAI8F;;;;gHA8FID',
        names: ['apples', 'pears', 'bananas'],
        sources: ['path1', 'path2', 'path3'],
        sourcesContent: ['code1', 'code2', 'code3'],
        version: 3,
      }),
    ).toMatchSnapshot();
  });

  it('offsets the resulting source map by the provided offset argument', () => {
    const input = [
      {
        code: lines(11),
        functionMap: null,
        map: [
          [1, 2],
          [3, 4, 5, 6, 'apples'],
          [7, 8, 9, 10],
          [11, 12, 13, 14, 'pears'],
        ],
        source: 'code1',
        path: 'path1',
      },
      {
        code: lines(3),
        functionMap: null,
        map: [
          [1, 2],
          [3, 4, 15, 16, 'bananas'],
        ],
        source: 'code2',
        path: 'path2',
      },
      {
        code: lines(23),
        functionMap: null,
        map: [
          [11, 12],
          [13, 14, 15, 16, 'bananas'],
          [17, 18, 19, 110],
          [21, 112, 113, 114, 'pears'],
        ],
        source: 'code3',
        path: 'path3',
      },
    ];

    expect(fromRawMappings(input, 8).toMap()).toEqual({
      mappings:
        ';;;;;;;;E;;IAIMA;;;;QAII;;;;YAIIC;E;;ICEEC;;;;;;;;;;;Y;;cCAAA;;;;kBAI8F;;;;gHA8FID',
      names: ['apples', 'pears', 'bananas'],
      sources: ['path1', 'path2', 'path3'],
      sourcesContent: ['code1', 'code2', 'code3'],
      version: 3,
    });
  });
});

const lines = (n: number) => Array(n).join('\n');
