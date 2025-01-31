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

import type {FileMetaData} from '../../flow-types';
import type HasteMapType from '../MutableHasteMap';

let mockPathModule;
jest.mock('path', () => mockPathModule);

describe.each([['win32'], ['posix']])('HasteMap on %s', platform => {
  const p: string => string = filePath =>
    platform === 'win32'
      ? filePath.replace(/\//g, '\\').replace(/^\\/, 'C:\\')
      : filePath;

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
    HasteMap = require('../MutableHasteMap').default;
    DuplicateHasteCandidatesError =
      require('../DuplicateHasteCandidatesError').DuplicateHasteCandidatesError;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  test('initialize', async () => {
    const hasteMap = new HasteMap(opts);
    const initialState = {
      metadataIterator: jest.fn().mockReturnValue([
        {
          canonicalPath: p('project/Foo.js'),
          baseName: 'Foo.js',
          metadata: hasteMetadata('NameForFoo'),
        },
      ]),
    };
    await hasteMap.initialize(initialState);
    expect(initialState.metadataIterator).toHaveBeenCalledWith({
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
        metadataIterator: jest.fn().mockReturnValue([
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
        ]),
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
});

function hasteMetadata(hasteName: string): FileMetaData {
  return [hasteName, 0, 0, 0, '', '', 0];
}
