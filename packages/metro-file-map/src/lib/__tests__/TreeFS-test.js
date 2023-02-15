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

import type TreeFS from '../TreeFS';

let mockPathModule;
jest.mock('path', () => mockPathModule);

describe.each([['win32'], ['posix']])('TreeFS on %s', platform => {
  // Convenience function to write paths with posix separators but convert them
  // to system separators
  const p: string => string = filePath =>
    platform === 'win32'
      ? filePath.replace(/\//g, '\\').replace(/^\\/, 'C:\\')
      : filePath;

  let tfs: TreeFS;
  beforeEach(() => {
    jest.resetModules();
    mockPathModule = jest.requireActual<{}>('path')[platform];
    const TreeFS = require('../TreeFS').default;
    tfs = new TreeFS({
      rootDir: p('/project'),
      files: new Map([
        [p('foo/another.js'), ['', 123, 0, 0, '', '', 0]],
        [p('foo/link-to-bar.js'), ['', 0, 0, 0, '', '', p('../bar.js')]],
        [p('foo/link-to-another.js'), ['', 0, 0, 0, '', '', p('another.js')]],
        [p('../outside/external.js'), ['', 0, 0, 0, '', '', 0]],
        [p('bar.js'), ['', 234, 0, 0, '', '', 0]],
        [p('link-to-foo'), ['', 456, 0, 0, '', '', p('./foo')]],
        [p('root'), ['', 0, 0, 0, '', '', '..']],
        [p('link-to-nowhere'), ['', 0, 0, 0, '', '', p('./nowhere')]],
        [p('link-to-self'), ['', 0, 0, 0, '', '', p('./link-to-self')]],
        [p('link-cycle-1'), ['', 0, 0, 0, '', '', p('./link-cycle-2')]],
        [p('link-cycle-2'), ['', 0, 0, 0, '', '', p('./link-cycle-1')]],
      ]),
    });
  });

  test('all files iterator returns all regular files by real path', () => {
    expect(tfs.getAllFiles().sort()).toEqual([
      p('/outside/external.js'),
      p('/project/bar.js'),
      p('/project/foo/another.js'),
    ]);
  });

  test.each([
    p('/outside/external.js'),
    p('/project/bar.js'),
    p('/project/foo/another.js'),
    p('/project/foo/link-to-another.js'),
    p('/project/link-to-foo/another.js'),
    p('/project/link-to-foo/link-to-another.js'),
    p('/project/root/outside/external.js'),
  ])('existence check passes for regular files via symlinks: %s', filePath => {
    expect(tfs.exists(filePath)).toBe(true);
  });

  test('existence check fails for directories, symlinks to directories, or symlinks to nowhere', () => {
    expect(tfs.exists(p('/project/foo'))).toBe(false);
    expect(tfs.exists(p('/project/link-to-foo'))).toBe(false);
    expect(tfs.exists(p('/project/link-to-nowhere'))).toBe(false);
  });

  test('implements linkStats()', () => {
    expect(tfs.linkStats(p('/project/link-to-foo/another.js'))).toEqual({
      fileType: 'f',
      modifiedTime: 123,
    });
    expect(tfs.linkStats(p('bar.js'))).toEqual({
      fileType: 'f',
      modifiedTime: 234,
    });
    expect(tfs.linkStats(p('./link-to-foo'))).toEqual({
      fileType: 'l',
      modifiedTime: 456,
    });
  });

  describe('getRealPath', () => {
    test.each([
      [p('/project/foo/link-to-another.js'), p('/project/foo/another.js')],
      [p('/project/foo/link-to-bar.js'), p('/project/bar.js')],
      [p('link-to-foo/link-to-another.js'), p('/project/foo/another.js')],
      [p('/project/root/outside/external.js'), p('/outside/external.js')],
      [p('/outside/../project/bar.js'), p('/project/bar.js')],
    ])('%s -> %s', (givenPath, expectedRealPath) =>
      expect(tfs.getRealPath(givenPath)).toEqual(expectedRealPath),
    );

    test.each([
      [p('/project/foo')],
      [p('/project/bar.js/bad-parent')],
      [p('/project/root/outside')],
      [p('/project/link-to-nowhere')],
      [p('/project/not/exists')],
    ])('returns null for directories or broken paths: %s', givenPath =>
      expect(tfs.getRealPath(givenPath)).toEqual(null),
    );
  });

  describe('matchFilesWithContext', () => {
    test('non-recursive, skipping deep paths', () => {
      expect(
        tfs.matchFilesWithContext(p('/project'), {
          filter: new RegExp(
            // Test starting with `./` since this is mandatory for parity with Webpack.
            /^\.\/.*/,
          ),
          recursive: false,
        }),
      ).toEqual([p('/project/bar.js')]);
    });

    test('inner directory', () => {
      expect(
        tfs.matchFilesWithContext(p('/project/foo'), {
          filter: new RegExp(/.*/),
          recursive: true,
        }),
      ).toEqual([
        p('/project/foo/another.js'),
        p('/project/foo/link-to-bar.js'),
        p('/project/foo/link-to-another.js'),
      ]);
    });

    test('outside rootDir', () => {
      expect(
        tfs.matchFilesWithContext(p('/outside'), {
          filter: new RegExp(/.*/),
          recursive: true,
        }),
      ).toEqual([p('/outside/external.js')]);
    });

    test('recursive', () => {
      expect(
        tfs.matchFilesWithContext(p('/project'), {
          filter: new RegExp(/.*/),
          recursive: true,
        }),
      ).toEqual([
        p('/project/foo/another.js'),
        p('/project/foo/link-to-bar.js'),
        p('/project/foo/link-to-another.js'),
        p('/project/bar.js'),
        p('/project/link-to-foo/another.js'),
        p('/project/link-to-foo/link-to-bar.js'),
        p('/project/link-to-foo/link-to-another.js'),
        p('/project/root/outside/external.js'),
      ]);
    });

    test('recursive with filter', () => {
      expect(
        tfs.matchFilesWithContext(p('/project'), {
          filter: new RegExp(/\/another\.js/),
          recursive: true,
        }),
      ).toEqual([
        p('/project/foo/another.js'),
        p('/project/link-to-foo/another.js'),
      ]);
    });
  });
});
