/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 * @oncall react_native
 */

import type {RootPathUtils as RootPathUtilsT} from '../RootPathUtils';

let mockPathModule;
jest.mock('path', () => mockPathModule);

describe.each([['win32'], ['posix']])('pathUtilsForRoot on %s', platform => {
  // Convenience function to write paths with posix separators but convert them
  // to system separators
  const p: string => string = filePath =>
    platform === 'win32'
      ? filePath.replace(/\//g, '\\').replace(/^\\/, 'C:\\')
      : filePath;

  let RootPathUtils: Class<RootPathUtilsT>;
  let pathUtils: RootPathUtilsT;
  let pathRelative: JestMockFn<[string, string], string>;

  beforeEach(() => {
    jest.resetModules();
    mockPathModule = jest.requireActual<{}>('path')[platform];
    pathRelative = jest.spyOn(mockPathModule, 'relative');
    RootPathUtils = require('../RootPathUtils').RootPathUtils;
  });

  test.each([
    p('/project/root/baz/foobar'),
    p('/project/root/../root2/foobar'),
    p('/project/root/../../project2/foo'),
    p('/project/root/../../project/foo'),
    p('/project/root/../../project/root'),
    p('/project/root/../../project/root/foo.js'),
    p('/project/bar'),
    p('/project/../outside/bar'),
    p('/project/baz/foobar'),
    p('/project/rootfoo/baz'),
    p('/project'),
    p('/'),
    p('/outside'),
  ])(`absoluteToNormal('%s') is correct and optimised`, normalPath => {
    const rootDir = p('/project/root');
    pathUtils = new RootPathUtils(rootDir);
    const expected = mockPathModule.relative(rootDir, normalPath);
    pathRelative.mockClear();
    expect(pathUtils.absoluteToNormal(normalPath)).toEqual(expected);
    expect(pathRelative).not.toHaveBeenCalled();
  });

  describe.each([p('/project/root'), p('/')])('root: %s', rootDir => {
    beforeEach(() => {
      pathRelative.mockClear();
      pathUtils = new RootPathUtils(rootDir);
    });

    test.each([
      p('/project/root/../root2/../root3/foo'),
      p('/project/root/./baz/foo/bar'),
      p('/project/root/a./../foo'),
      p('/project/root/../a./foo'),
      p('/project/root/.././foo'),
    ])(`absoluteToNormal('%s') falls back to path.relative`, normalPath => {
      const expected = mockPathModule.relative(rootDir, normalPath);
      pathRelative.mockClear();
      expect(pathUtils.absoluteToNormal(normalPath)).toEqual(expected);
      expect(pathRelative).toHaveBeenCalled();
    });

    test.each([
      p('..'),
      p('../..'),
      p('normal/path'),
      p('../normal/path'),
      p('../../normal/path'),
      p('../../../normal/path'),
    ])(`normalToAbsolute('%s') matches path.resolve`, normalPath => {
      expect(pathUtils.normalToAbsolute(normalPath)).toEqual(
        mockPathModule.resolve(rootDir, normalPath),
      );
    });

    test.each([
      p('..'),
      p('../root'),
      p('../root/path'),
      p('../project'),
      p('../../project/root'),
      p('../../../normal/path'),
      p('../../..'),
    ])(
      `relativeToNormal('%s') matches path.resolve + path.relative`,
      relativePath => {
        expect(pathUtils.relativeToNormal(relativePath)).toEqual(
          mockPathModule.relative(
            rootDir,
            mockPathModule.resolve(rootDir, relativePath),
          ),
        );
      },
    );
  });
});
