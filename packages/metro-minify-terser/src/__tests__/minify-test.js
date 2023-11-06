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

import type {BasicSourceMap} from 'metro-source-map';

const minify = require('..');

jest.mock('terser', () => ({
  minify: jest.fn(code => {
    return Promise.resolve({
      code: code.replace(/(^|\W)\s+/g, '$1'),
      map: {},
    });
  }),
}));
const {objectContaining} = expect;

function getFakeMap(): BasicSourceMap {
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
  let map: BasicSourceMap;
  let terser;

  beforeEach(() => {
    terser = require('terser');
    /* $FlowFixMe(>=0.99.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.99 was deployed. To see the error, delete this
     * comment and run Flow. */
    terser.minify.mockClear();
    /* $FlowFixMe(>=0.99.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.99 was deployed. To see the error, delete this
     * comment and run Flow. */
    terser.minify.mockResolvedValue({code: '', map: '{}'});
    map = getFakeMap();
  });

  it('passes file name, code, and source map to `terser`', async () => {
    await minify({
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

  it('returns the code provided by terser', async () => {
    /* $FlowFixMe(>=0.99.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.99 was deployed. To see the error, delete this
     * comment and run Flow. */
    terser.minify.mockResolvedValue({code, map: '{}'});
    const result = await minify(baseOptions);
    expect(result.code).toBe(code);
  });

  it('parses the source map object provided by terser and sets the sources property', async () => {
    /* $FlowFixMe(>=0.99.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.99 was deployed. To see the error, delete this
     * comment and run Flow. */
    terser.minify.mockResolvedValue({map: JSON.stringify(map), code: ''});
    const result = await minify({...baseOptions, filename});
    expect(result.map).toEqual({...map, sources: [filename]});
  });
});
