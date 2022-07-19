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
} from '../contextModule';

describe('getContextModuleId', () => {
  it(`creates a context module ID`, () => {
    for (const [ctx, results] of [
      [
        {
          filter: {pattern: '.*', flags: ''},
          mode: 'eager',
          recursive: true,
        },
        '/path/to eager recursive /.*/',
      ],
      [
        {
          filter: {pattern: '.*', flags: ''},
          mode: 'lazy',
          recursive: false,
        },
        '/path/to lazy /.*/',
      ],
    ])
      expect(getContextModuleId('/path/to', ctx)).toBe(results);
  });
});

describe('appendContextQueryParam', () => {
  it(`appends a context query parameter to the input path`, () => {
    expect(
      appendContextQueryParam({
        from: '/path/to/project',
        filter: {pattern: '[a-zA-Z]+', flags: ''},
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
        mode: 'lazy',
        from: '/path/to/project',
        filter: {pattern: '.*', flags: ''},
        recursive: true,
      }),
    ).toBe(true);
  });
});
