/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 */
'use strict';

jest.mock('uglify-es', () => ({
  minify: jest.fn(code => {
    return {
      code: code.replace(/(^|\W)\s+/g, '$1'),
      map: {},
    };
  }),
}));

const minify = require('../minify');
const {objectContaining} = jasmine;

describe('Minification:', () => {
  const filename = '/arbitrary/file.js';
  const code = 'arbitrary(code)';
  let map;
  let uglify;

  beforeEach(() => {
    uglify = require('uglify-es');
    uglify.minify.mockClear();
    uglify.minify.mockReturnValue({code: '', map: '{}'});
    map = {version: 3, sources: ['?'], mappings: ''};
  });

  it('passes file name, code, and source map to `uglify`', () => {
    minify.withSourceMap(code, map, filename);
    expect(uglify.minify).toBeCalledWith(
      code,
      objectContaining({
        sourceMap: {
          content: map,
          includeSources: false,
        },
      }),
    );
  });

  it('passes code to `uglify` when minifying without source map', () => {
    minify.noSourceMap(code);
    expect(uglify.minify).toBeCalledWith(
      code,
      objectContaining({
        sourceMap: {
          content: undefined,
          includeSources: false,
        },
      }),
    );
  });

  it('returns the code provided by uglify', () => {
    uglify.minify.mockReturnValue({code, map: '{}'});
    const result = minify.withSourceMap('', {}, '');
    expect(result.code).toBe(code);
    expect(minify.noSourceMap('')).toBe(code);
  });

  it('parses the source map object provided by uglify and sets the sources property', () => {
    uglify.minify.mockReturnValue({map: JSON.stringify(map), code: ''});
    const result = minify.withSourceMap('', {}, filename);
    expect(result.map).toEqual({...map, sources: [filename]});
  });
});
