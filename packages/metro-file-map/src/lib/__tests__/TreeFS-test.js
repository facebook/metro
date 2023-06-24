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
import type {FileData} from '../../flow-types';

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
        [p('link-to-nowhere'), ['', 123, 0, 0, '', '', p('./nowhere')]],
        [p('link-to-self'), ['', 123, 0, 0, '', '', p('./link-to-self')]],
        [p('link-cycle-1'), ['', 123, 0, 0, '', '', p('./link-cycle-2')]],
        [p('link-cycle-2'), ['', 123, 0, 0, '', '', p('./link-cycle-1')]],
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

  describe('getDifference', () => {
    test('returns changed (inc. new) and removed files in given FileData', () => {
      const newFiles: FileData = new Map([
        [p('new-file'), ['', 789, 0, 0, '', '', 0]],
        [p('link-to-foo'), ['', 456, 0, 0, '', '', p('./foo')]],
        // Different modified time, expect new mtime in changedFiles
        [p('foo/another.js'), ['', 124, 0, 0, '', '', 0]],
        [p('link-cycle-1'), ['', 123, 0, 0, '', '', p('./link-cycle-2')]],
        [p('link-cycle-2'), ['', 123, 0, 0, '', '', p('./link-cycle-1')]],
        // Was a symlink, now a regular file
        [p('link-to-self'), ['', 123, 0, 0, '', '', 0]],
        [p('link-to-nowhere'), ['', 123, 0, 0, '', '', p('./nowhere')]],
      ]);
      expect(tfs.getDifference(newFiles)).toEqual({
        changedFiles: new Map([
          [p('new-file'), ['', 789, 0, 0, '', '', 0]],
          [p('foo/another.js'), ['', 124, 0, 0, '', '', 0]],
          [p('link-to-self'), ['', 123, 0, 0, '', '', 0]],
        ]),
        removedFiles: new Set([
          p('foo/link-to-bar.js'),
          p('foo/link-to-another.js'),
          p('../outside/external.js'),
          p('bar.js'),
          p('root'),
        ]),
      });
    });
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

  describe('mutation', () => {
    describe('addOrModify', () => {
      test('accepts non-real and absolute paths', () => {
        tfs.addOrModify(p('link-to-foo/new.js'), ['', 0, 1, 0, '', '', 0]);
        tfs.addOrModify(p('/project/fileatroot.js'), ['', 0, 2, 0, '', '', 0]);
        expect(tfs.getAllFiles().sort()).toEqual([
          p('/outside/external.js'),
          p('/project/bar.js'),
          p('/project/fileatroot.js'),
          p('/project/foo/another.js'),
          p('/project/foo/new.js'),
        ]);
        expect(tfs.getSize(p('/project/link-to-foo/new.js'))).toEqual(1);
        expect(tfs.getSize(p('/project/fileatroot.js'))).toEqual(2);
      });
    });

    describe('bulkAddOrModify', () => {
      test('adds new files and modifies existing, new symlinks work', () => {
        tfs.bulkAddOrModify(
          new Map([
            [
              p('newdir/link-to-link-to-bar.js'),
              ['', 0, 0, 0, '', '', p('../foo/link-to-bar.js')],
            ],
            [p('foo/baz.js'), ['', 0, 0, 0, '', '', 0]],
            [p('bar.js'), ['', 999, 0, 0, '', '', 0]],
          ]),
        );

        expect(tfs.getAllFiles().sort()).toEqual([
          p('/outside/external.js'),
          p('/project/bar.js'),
          p('/project/foo/another.js'),
          p('/project/foo/baz.js'),
        ]);

        expect(
          tfs.getRealPath(p('/project/newdir/link-to-link-to-bar.js')),
        ).toEqual(p('/project/bar.js'));

        expect(tfs.linkStats('bar.js')).toEqual({
          modifiedTime: 999,
          fileType: 'f',
        });
      });
    });

    describe('remove', () => {
      test.each([
        [p('bar.js')],
        [p('./bar.js')],
        [p('./link-to-foo/.././bar.js')],
        [p('/outside/../project/./bar.js')],
      ])('removes a file and returns its metadata: %s', mixedPath => {
        expect(tfs.linkStats(mixedPath)).not.toBeNull();
        expect(Array.isArray(tfs.remove(mixedPath))).toBe(true);
        expect(tfs.linkStats(mixedPath)).toBeNull();
      });

      test('deletes a symlink, not its target', () => {
        expect(tfs.linkStats(p('foo/link-to-bar.js'))).not.toBeNull();
        expect(tfs.linkStats(p('bar.js'))).not.toBeNull();
        expect(Array.isArray(tfs.remove(p('foo/link-to-bar.js')))).toBe(true);
        expect(tfs.linkStats(p('foo/link-to-bar.js'))).toBeNull();
        expect(tfs.linkStats(p('bar.js'))).not.toBeNull();
      });

      test('returns null for a non-existent file', () => {
        expect(tfs.remove('notexists.js')).toBeNull();
      });
    });
  });
});
