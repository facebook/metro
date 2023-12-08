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

import {
  deriveAbsolutePathFromContext,
  fileMatchesContext,
} from '../contextModule';

describe('deriveAbsolutePathFromContext', () => {
  test('appends a context query parameter to the input path', () => {
    expect(
      deriveAbsolutePathFromContext('/path/to/project', {
        filter: {pattern: '[a-zA-Z]+', flags: ''},
        mode: 'eager',
        recursive: true,
      }),
    ).toBe('/path/to/project?ctx=fd99d04afc2c8f6f913c8a955e33e978aa1e9977');

    expect(
      deriveAbsolutePathFromContext('/path/to/elsewhere', {
        filter: {pattern: '[a-zA-Z]+', flags: ''},
        mode: 'eager',
        recursive: true,
      }),
    ).toBe('/path/to/elsewhere?ctx=fd99d04afc2c8f6f913c8a955e33e978aa1e9977');

    expect(
      deriveAbsolutePathFromContext('/path/to/project', {
        filter: {pattern: '.*', flags: ''},
        mode: 'eager',
        recursive: true,
      }),
    ).toBe('/path/to/project?ctx=84326df05531bdd74cf80ae1c288b203517fd25a');

    expect(
      deriveAbsolutePathFromContext('/path/to/project', {
        filter: {pattern: '.*', flags: ''},
        mode: 'lazy',
        recursive: false,
      }),
    ).toBe('/path/to/project?ctx=a22638608f758d428784408c78f67162c8c0dd53');
  });
});

describe('fileMatchesContext', () => {
  test('matches files', () => {
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
