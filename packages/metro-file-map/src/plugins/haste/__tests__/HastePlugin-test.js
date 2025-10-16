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
      pluginData: 'NameForFoo',
    },
    {
      canonicalPath: p('project/Bar.js'),
      baseName: 'Bar.js',
      pluginData: 'Bar',
    },
    {
      canonicalPath: p('project/Duplicate.js'),
      baseName: 'Duplicate.js',
      pluginData: 'Duplicate',
    },
    {
      canonicalPath: p('project/other/Duplicate.js'),
      baseName: 'Duplicate.js',
      pluginData: 'Duplicate',
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
        fileIterator: jest.fn().mockReturnValue([
          {
            canonicalPath: p('project/Foo.js'),
            baseName: 'Foo.js',
            pluginData: 'NameForFoo',
          },
        ]),
        lookup: jest.fn(),
      },
      pluginState: null,
    };
    await hasteMap.initialize(initialState);
    expect(initialState.files.fileIterator).toHaveBeenCalledWith({
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
          fileIterator: jest.fn().mockReturnValue(INITIAL_FILES),
          lookup: jest.fn(),
        },
        pluginState: null,
      });
    });

    test('removes a module, without affecting others', () => {
      expect(hasteMap.getModule('NameForFoo')).not.toBeNull();
      hasteMap.onRemovedFile(p('project/Foo.js'), 'NameForFoo');
      expect(hasteMap.getModule('NameForFoo')).toBeNull();
      expect(hasteMap.getModule('Bar')).not.toBeNull();
    });

    test('removes one of a pair of duplicates', () => {
      expect(() => hasteMap.getModule('Duplicate')).toThrow(
        DuplicateHasteCandidatesError,
      );
      hasteMap.onRemovedFile(p('project/Duplicate.js'), 'Duplicate');
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
          fileIterator: jest.fn().mockReturnValue(INITIAL_FILES),
          lookup: jest.fn(),
        },
        pluginState: null,
      });
    });

    test('removes a module, without affecting others', () => {
      expect(hasteMap.getModule('NameForFoo')).not.toBeNull();
      hasteMap.onRemovedFile(p('project/Foo.js'), 'NameForFoo');
      expect(hasteMap.getModule('NameForFoo')).toBeNull();
      expect(hasteMap.getModule('Bar')).not.toBeNull();
    });

    test('fixes duplicates, adds and removes modules', async () => {
      expect(() => hasteMap.getModule('Duplicate')).toThrow(
        DuplicateHasteCandidatesError,
      );
      await hasteMap.bulkUpdate({
        removed: [
          [p('project/Duplicate.js'), 'Duplicate'],
          [p('project/Foo.js'), 'NameForFoo'],
        ],
        addedOrModified: [
          [p('project/Baz.js'), 'Baz'], // New
          [p('project/other/Bar.js'), 'Bar'], // New duplicate
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
    let lookup;

    beforeEach(async () => {
      hasteMap = new HasteMap(opts);
      lookup = jest.fn().mockReturnValue(null);

      await hasteMap.initialize({
        files: {
          fileIterator: jest.fn().mockReturnValue(INITIAL_FILES),
          lookup,
        },
        pluginState: null,
      });
    });

    test('returns the correct module name', () => {
      lookup.mockImplementation(
        filePath =>
          ({
            [p('/root/Foo.js')]: {
              exists: true,
              type: 'f',
              pluginData: 'Foo' as ?string,
            },
            [p('/root/not-haste.js')]: {
              exists: true,
              type: 'f',
              pluginData: null as ?string,
            },
          })[filePath] ?? {exists: false},
      );
      expect(hasteMap.getModuleNameByPath(p('/root/Foo.js'))).toBe('Foo');
      expect(hasteMap.getModuleNameByPath(p('/root/not-haste.js'))).toBe(null);
      expect(hasteMap.getModuleNameByPath(p('/root/not-exists.js'))).toBe(null);
    });
  });
});
