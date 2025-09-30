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

import type {FileMetadata} from '../../../flow-types';
import type HasteMapType from '../../HastePlugin';

let mockPathModule;
jest.mock('path', () => mockPathModule);

describe.each([['win32'], ['posix']])('HastePlugin on %s', platform => {
  const p: string => string = filePath =>
    platform === 'win32'
      ? filePath.replace(/\//g, '\\').replace(/^\\/, 'C:\\')
      : filePath;

  const INITIAL_FILES = [
    {
      canonicalPath: p('project/Foo.js'),
      baseName: 'Foo.js',
      metadata: hasteMetadata('NameForFoo'),
    },
    {
      canonicalPath: p('project/Bar.js'),
      baseName: 'Bar.js',
      metadata: hasteMetadata('Bar'),
    },
    {
      canonicalPath: p('project/Duplicate.js'),
      baseName: 'Duplicate.js',
      metadata: hasteMetadata('Duplicate'),
    },
    {
      canonicalPath: p('project/other/Duplicate.js'),
      baseName: 'Duplicate.js',
      metadata: hasteMetadata('Duplicate'),
    },
  ];

  let HasteMap: Class<HasteMapType>;
  let DuplicateHasteCandidatesError;

  const opts = {
    enableHastePackages: false,
    failValidationOnConflicts: false,
    perfLogger: null,
    platforms: new Set(['ios', 'android']),
    rootDir: p('/root'),
  };

  beforeEach(() => {
    jest.resetModules();
    mockPathModule = jest.requireActual<{}>('path')[platform];
    HasteMap = require('../../HastePlugin').default;
    DuplicateHasteCandidatesError =
      require('../DuplicateHasteCandidatesError').DuplicateHasteCandidatesError;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  test('initialize', async () => {
    const hasteMap = new HasteMap(opts);
    const initialState = {
      files: {
        metadataIterator: jest.fn().mockReturnValue([
          {
            canonicalPath: p('project/Foo.js'),
            baseName: 'Foo.js',
            metadata: hasteMetadata('NameForFoo'),
          },
        ]),
        getFileMetadata: jest.fn(),
      },
      pluginState: null,
    };
    await hasteMap.initialize(initialState);
    expect(initialState.files.metadataIterator).toHaveBeenCalledWith({
      includeNodeModules: false,
      includeSymlinks: false,
    });
    expect(hasteMap.getModule('NameForFoo')).toEqual(p('/root/project/Foo.js'));
  });

  describe('onRemovedFile', () => {
    let hasteMap: HasteMapType;

    beforeEach(async () => {
      hasteMap = new HasteMap(opts);
      await hasteMap.initialize({
        files: {
          metadataIterator: jest.fn().mockReturnValue(INITIAL_FILES),
          getFileMetadata: jest.fn(),
        },
        pluginState: null,
      });
    });

    test('removes a module, without affecting others', () => {
      expect(hasteMap.getModule('NameForFoo')).not.toBeNull();
      hasteMap.onRemovedFile(p('project/Foo.js'), hasteMetadata('NameForFoo'));
      expect(hasteMap.getModule('NameForFoo')).toBeNull();
      expect(hasteMap.getModule('Bar')).not.toBeNull();
    });

    test('removes one of a pair of duplicates', () => {
      expect(() => hasteMap.getModule('Duplicate')).toThrow(
        DuplicateHasteCandidatesError,
      );
      hasteMap.onRemovedFile(
        p('project/Duplicate.js'),
        hasteMetadata('Duplicate'),
      );
      expect(hasteMap.getModule('Duplicate')).toBe(
        p('/root/project/other/Duplicate.js'),
      );
    });
  });

  describe('bulkUpdate', () => {
    let hasteMap: HasteMapType;

    beforeEach(async () => {
      hasteMap = new HasteMap(opts);
      await hasteMap.initialize({
        files: {
          metadataIterator: jest.fn().mockReturnValue(INITIAL_FILES),
          getFileMetadata: jest.fn(),
        },
        pluginState: null,
      });
    });

    test('removes a module, without affecting others', () => {
      expect(hasteMap.getModule('NameForFoo')).not.toBeNull();
      hasteMap.onRemovedFile(p('project/Foo.js'), hasteMetadata('NameForFoo'));
      expect(hasteMap.getModule('NameForFoo')).toBeNull();
      expect(hasteMap.getModule('Bar')).not.toBeNull();
    });

    test('fixes duplicates, adds and removes modules', async () => {
      expect(() => hasteMap.getModule('Duplicate')).toThrow(
        DuplicateHasteCandidatesError,
      );
      await hasteMap.bulkUpdate({
        removed: [
          [p('project/Duplicate.js'), hasteMetadata('Duplicate')],
          [p('project/Foo.js'), hasteMetadata('NameForFoo')],
        ],
        addedOrModified: [
          [p('project/Baz.js'), hasteMetadata('Baz')], // New
          [p('project/other/Bar.js'), hasteMetadata('Bar')], // New duplicate
        ],
      });
      expect(hasteMap.getModule('Duplicate')).toBe(
        p('/root/project/other/Duplicate.js'),
      );
      expect(hasteMap.getModule('NameForFoo')).toBeNull();
      expect(hasteMap.getModule('Baz')).toBe(p('/root/project/Baz.js'));
      expect(() => hasteMap.getModule('Bar')).toThrow(
        DuplicateHasteCandidatesError,
      );
    });
  });

  describe('getModuleNameByPath', () => {
    let hasteMap: HasteMapType;
    let getFileMetadata;

    beforeEach(async () => {
      hasteMap = new HasteMap(opts);
      getFileMetadata = jest.fn().mockReturnValue(null);

      await hasteMap.initialize({
        files: {
          metadataIterator: jest.fn().mockReturnValue(INITIAL_FILES),
          getFileMetadata,
        },
        pluginState: null,
      });
    });

    test('returns the correct module name', () => {
      getFileMetadata.mockImplementation(
        filePath =>
          ({
            [p('/root/Foo.js')]: hasteMetadata('Foo'),
            [p('/root/not-haste.js')]: hasteMetadata(null),
          })[filePath] ?? null,
      );
      expect(hasteMap.getModuleNameByPath(p('/root/Foo.js'))).toBe('Foo');
      expect(hasteMap.getModuleNameByPath(p('/root/not-haste.js'))).toBe(null);
      expect(hasteMap.getModuleNameByPath(p('/root/not-exists.js'))).toBe(null);
    });
  });
});

function hasteMetadata(hasteName: ?string): FileMetadata {
  return [0, 0, 0, '', '', 0, hasteName];
}
