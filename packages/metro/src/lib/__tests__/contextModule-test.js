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
  deriveAbsolutePathFromContext,
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

describe('deriveAbsolutePathFromContext', () => {
  it(`appends a context query parameter to the input path`, () => {
    expect(
      deriveAbsolutePathFromContext('/path/to/project', {
        filter: {pattern: '[a-zA-Z]+', flags: ''},
        mode: 'eager',
        recursive: true,
      }),
    ).toBe('/path/to/project?ctx=fd99d04afc2c8f6f913c8a955e33e978aa1e9977');
  });
});

describe('fileMatchesContext', () => {
  it(`matches files`, () => {
    expect(
      fileMatchesContext('/path/to/project/index.js', {
        mode: 'lazy',
        from: '/path/to/project',
        filter: /.*/,
        recursive: true,
      }),
    ).toBe(true);
  });
});
