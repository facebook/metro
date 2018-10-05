/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @emails oncall+js_foundation
 */
'use strict';

import type {BabelSourceMap} from '@babel/core';

jest.mock('terser', () => ({
  minify: jest.fn(code => {
    return {
      code: code.replace(/(^|\W)\s+/g, '$1'),
      map: {},
    };
  }),
}));

const minify = require('..');
const {objectContaining} = jasmine;

function getFakeMap(): BabelSourceMap {
  return {
    version: 3,
    sources: ['?'],
    mappings: '',
    names: [],
  };
}

const baseOptions = {
  code: '',
  map: getFakeMap(),
  filename: '',
  reserved: [],
  config: {},
};

describe('Minification:', () => {
  const filename = '/arbitrary/file.js';
  const code = 'arbitrary(code)';
  let map: BabelSourceMap;
  let terser;

  beforeEach(() => {
    terser = require('terser');
    terser.minify.mockClear();
    terser.minify.mockReturnValue({code: '', map: '{}'});
    map = getFakeMap();
  });

  it('passes file name, code, and source map to `terser`', () => {
    minify({
      ...baseOptions,
      code,
      map,
      filename,
      config: {sourceMap: {includeSources: false}},
    });
    expect(terser.minify).toBeCalledWith(
      code,
      objectContaining({
        sourceMap: {
          content: map,
          includeSources: false,
        },
      }),
    );
  });

  it('returns the code provided by terser', () => {
    terser.minify.mockReturnValue({code, map: '{}'});
    const result = minify(baseOptions);
    expect(result.code).toBe(code);
  });

  it('parses the source map object provided by terser and sets the sources property', () => {
    terser.minify.mockReturnValue({map: JSON.stringify(map), code: ''});
    const result = minify({...baseOptions, filename});
    expect(result.map).toEqual({...map, sources: [filename]});
  });
});
