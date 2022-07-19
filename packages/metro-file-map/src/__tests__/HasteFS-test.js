/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

import HasteFS from '../HasteFS';

describe('matchFilesWithContext', () => {
  it(`matches files against context`, () => {
    const hfs = new HasteFS({
      rootDir: '/',
      files: new Map([]),
    });

    // $FlowFixMe: mocking files
    hfs.getAbsoluteFileIterator = function () {
      return ['/foo/another.js', '/bar.js'];
    };

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
