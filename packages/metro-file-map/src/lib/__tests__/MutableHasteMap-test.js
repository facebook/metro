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

describe.each([['win32'], ['posix']])('MockMap on %s', platform => {
  const p: string => string = filePath =>
    platform === 'win32'
      ? filePath.replace(/\//g, '\\').replace(/^\\/, 'C:\\')
      : filePath;

  let HasteMap: Class<HasteMapType>;

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
});

function hasteMetadata(hasteName: string): FileMetaData {
  return [hasteName, 0, 0, 0, '', '', 0];
}
