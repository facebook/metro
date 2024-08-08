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

describe.each([['win32'], ['posix']])('RootPathUtils on %s', platform => {
  // Convenience function to write paths with posix separators but convert them
  // to system separators
  const p: string => string = filePath =>
    platform === 'win32'
      ? filePath.replace(/\//g, '\\').replace(/^\\/, 'C:\\')
      : filePath;

  let RootPathUtils: Class<RootPathUtilsT>;
  let pathUtils: RootPathUtilsT;
  let pathRelative: JestMockFn<[string, string], string>;
  let sep: string;

  beforeEach(() => {
    jest.resetModules();
    mockPathModule = jest.requireActual<{}>('path')[platform];
    sep = mockPathModule.sep;
    pathRelative = jest.spyOn(mockPathModule, 'relative');
    RootPathUtils = require('../RootPathUtils').RootPathUtils;
  });

  test.each([
    p('/project/root/baz/foobar'),
    p('/project/root/../root2/foobar'),
    p('/project/root/../../project2/foo'),
    p('/project/root/../../project/foo'),
    p('/project/root/../../project/foo/'),
    p('/project/root/../../project/root'),
    p('/project/root/../../project/root/'),
    p('/project/root/../../project/root/foo.js'),
    p('/project/bar'),
    p('/project/bar/'),
    p('/project/../outside/bar'),
    p('/project/baz/foobar'),
    p('/project/rootfoo/baz'),
    p('/project'),
    p('/project/'),
    p('/'),
    p('/outside'),
    p('/outside/'),
  ])(`absoluteToNormal('%s') is correct and optimised`, absolutePath => {
    const rootDir = p('/project/root');
    pathUtils = new RootPathUtils(rootDir);
    let expected = mockPathModule.relative(rootDir, absolutePath);
    // Unlike path.relative, we expect to preserve trailing separators.
    if (absolutePath.endsWith(sep) && expected !== '') {
      expected += sep;
    }
    pathRelative.mockClear();
    expect(pathUtils.absoluteToNormal(absolutePath)).toEqual(expected);
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
      p('/project/root/.././foo/'),
    ])(`absoluteToNormal('%s') falls back to path.relative`, absolutePath => {
      let expected = mockPathModule.relative(rootDir, absolutePath);
      // Unlike path.relative, we expect to preserve trailing separators.
      if (absolutePath.endsWith(sep) && !expected.endsWith(sep)) {
        expected += sep;
      }
      pathRelative.mockClear();
      expect(pathUtils.absoluteToNormal(absolutePath)).toEqual(expected);
      expect(pathRelative).toHaveBeenCalled();
    });

    test.each([
      p('..'),
      p('../..'),
      p('../../'),
      p('normal/path'),
      p('normal/path/'),
      p('../normal/path'),
      p('../normal/path/'),
      p('../../normal/path'),
      p('../../../normal/path'),
    ])(`normalToAbsolute('%s') matches path.resolve`, normalPath => {
      let expected = mockPathModule.resolve(rootDir, normalPath);
      // Unlike path.resolve, we expect to preserve trailing separators.
      if (normalPath.endsWith(sep) && !expected.endsWith(sep)) {
        expected += sep;
      }
      expect(pathUtils.normalToAbsolute(normalPath)).toEqual(expected);
    });

    test.each([
      p('..'),
      p('../root'),
      p('../root/path'),
      p('../project'),
      p('../project/'),
      p('../../project/root'),
      p('../../project/root/'),
      p('../../../normal/path'),
      p('../../../normal/path/'),
      p('../../..'),
    ])(
      `relativeToNormal('%s') matches path.resolve + path.relative`,
      relativePath => {
        let expected = mockPathModule.relative(
          rootDir,
          mockPathModule.resolve(rootDir, relativePath),
        );
        // Unlike native path.resolve + path.relative, we expect to preserve
        // trailing separators. (Consistent with path.normalize.)
        if (
          relativePath.endsWith(sep) &&
          !expected.endsWith(sep) &&
          expected !== ''
        ) {
          expected += sep;
        }
        expect(pathUtils.relativeToNormal(relativePath)).toEqual(expected);
      },
    );
  });
});
