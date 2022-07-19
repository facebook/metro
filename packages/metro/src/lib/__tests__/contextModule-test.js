/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

import {
  fileMatchesContext,
  appendContextQueryParam,
  getContextModuleId,
  ensureRequireContext,
} from '../contextModule';

describe('getContextModuleId', () => {
  it(`creates a context module ID`, () => {
    for (const [ctx, results] of [
      [
        {filter: /[a-zA-Z]+/, mode: 'eager', recursive: true},
        '/path/to eager recursive /[a-zA-Z]+/',
      ],
      [{filter: /.*/, mode: 'lazy', recursive: false}, '/path/to lazy /.*/'],
    ])
      expect(getContextModuleId('/path/to', ctx)).toBe(results);
  });
});

describe('appendContextQueryParam', () => {
  it(`appends a context query parameter to the input path`, () => {
    expect(
      appendContextQueryParam({
        from: '/path/to/project',
        filter: /[a-zA-Z]+/,
        mode: 'eager',
        recursive: true,
      }),
    ).toBe('/path/to/project?ctx=7d330128a8fe64375c6932e9204a6a5f40087f99');
  });
});

describe('fileMatchesContext', () => {
  it(`matches files`, () => {
    expect(
      fileMatchesContext('/path/to/project/index.js', {
        inputPath: '/path/to/project',
        filter: /.*/,
        recursive: true,
      }),
    ).toBe(true);
  });
});
