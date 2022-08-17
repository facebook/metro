/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import HasteFS from '../HasteFS';

jest.mock('../lib/fast_path', () => ({
  resolve: (a, b) => b,
  relative: jest.requireActual('path').relative,
}));

describe('matchFilesWithContext', () => {
  test('matches files against context', () => {
    const hfs = new HasteFS({
      rootDir: '/',
      files: new Map([
        [
          '/foo/another.js',
          // $FlowFixMe: mocking files
          {},
        ],
        [
          '/bar.js',
          // $FlowFixMe: mocking files
          {},
        ],
      ]),
    });

    // Test non-recursive skipping deep paths
    expect(
      hfs.matchFilesWithContext('/', {
        filter: new RegExp(
          // Test starting with `./` since this is mandatory for parity with Webpack.
          /^\.\/.*/,
        ),
        recursive: false,
      }),
    ).toEqual(['/bar.js']);

    // Test inner directory
    expect(
      hfs.matchFilesWithContext('/foo', {
        filter: new RegExp(/.*/),
        recursive: true,
      }),
    ).toEqual(['/foo/another.js']);

    // Test recursive
    expect(
      hfs.matchFilesWithContext('/', {
        filter: new RegExp(/.*/),
        recursive: true,
      }),
    ).toEqual(['/foo/another.js', '/bar.js']);
  });
});
