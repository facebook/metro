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

import type {FileMetaData, Path} from '../flow-types';
let mockPathModule;
jest.mock('path', () => mockPathModule);
jest.mock('../lib/fast_path', () => mockPathModule);

describe.each([['win32'], ['posix']])('HasteFS on %s', platform => {
  let HasteFS;
  let fs;

  // Convenience function to write paths with posix separators but convert them
  // to system separators
  const p: string => string = filePath =>
    platform === 'win32'
      ? filePath.replaceAll('/', '\\').replace(/^\\/, 'C:\\')
      : filePath;

  beforeAll(() => {
    mockPathModule = jest.requireActual<{}>('path')[platform];
    jest.resetModules();
    HasteFS = require('../HasteFS').default;
    fs = new HasteFS({
      rootDir: p('/project'),
      files: new Map([
        [p('foo/another.js'), ['', 0, 0, 1, '', '', 0]],
        [p('../outside/external.js'), ['', 0, 0, 1, '', '', 0]],
        [p('bar.js'), ['', 234, 0, 1, '', '', 0]],
      ]),
    });
  });

  test('getAllFiles returns all files by absolute path', () => {
    expect(fs.getAllFiles().sort()).toEqual([
      p('/outside/external.js'),
      p('/project/bar.js'),
      p('/project/foo/another.js'),
    ]);
  });

  test.each([
    p('/outside/external.js'),
    p('/project/bar.js'),
    p('/project/foo/another.js'),
  ])('existence check passes: %s', filePath => {
    expect(fs.exists(filePath)).toBe(true);
  });

  test('existence check fails for directories', () => {
    expect(fs.exists(p('/project/foo'))).toBe(false);
  });

  test('implements linkStats()', () => {
    expect(fs.linkStats(p('./bar.js'))).toEqual({
      fileType: 'f',
      modifiedTime: 234,
    });
  });

  describe('matchFiles', () => {
    test('matches files against a pattern', async () => {
      expect(
        fs.matchFiles(
          mockPathModule.sep === mockPathModule.win32.sep
            ? /project\\foo/
            : /project\/foo/,
        ),
      ).toEqual([p('/project/foo/another.js')]);
    });
  });

  describe('matchFilesWithContext', () => {
    test('matches files against context', () => {
      const fs = new HasteFS({
        rootDir: p('/root'),
        files: new Map<Path, FileMetaData>([
          [p('foo/another.js'), ['', 0, 0, 0, '', '', 0]],
          [p('bar.js'), ['', 0, 0, 0, '', '', 0]],
        ]),
      });

      expect([...fs.getAbsoluteFileIterator()]).toEqual([
        p('/root/foo/another.js'),
        p('/root/bar.js'),
      ]);

      // Test non-recursive skipping deep paths
      expect(
        fs.matchFilesWithContext(p('/root'), {
          filter: new RegExp(
            // Test starting with `./` since this is mandatory for parity with Webpack.
            /^\.\/.*/,
          ),
          recursive: false,
        }),
      ).toEqual([p('/root/bar.js')]);

      // Test inner directory
      expect(
        fs.matchFilesWithContext(p('/root/foo'), {
          filter: new RegExp(/.*/),
          recursive: true,
        }),
      ).toEqual([p('/root/foo/another.js')]);

      // Test recursive
      expect(
        fs.matchFilesWithContext(p('/root'), {
          filter: new RegExp(/.*/),
          recursive: true,
        }),
      ).toEqual([p('/root/foo/another.js'), p('/root/bar.js')]);
    });
  });
});
