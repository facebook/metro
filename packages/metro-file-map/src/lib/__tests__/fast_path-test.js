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

import typeof * as FastPath from '../fast_path';

let mockPathModule;
jest.mock('path', () => mockPathModule);

describe.each([['win32'], ['posix']])('fast_path on %s', platform => {
  // Convenience function to write paths with posix separators but convert them
  // to system separators
  const p: string => string = filePath =>
    platform === 'win32'
      ? filePath.replace(/\//g, '\\').replace(/^\\/, 'C:\\')
      : filePath;

  let fastPath: FastPath;
  let pathRelative: JestMockFn<[string, string], string>;

  beforeEach(() => {
    jest.resetModules();
    mockPathModule = jest.requireActual<{}>('path')[platform];
    pathRelative = jest.spyOn(mockPathModule, 'relative');
    fastPath = require('../fast_path');
  });

  test.each([
    p('/project/root/baz/foobar'),
    p('/project/root/../root2/foobar'),
    p('/project/root/../../project2/foo'),
  ])(`relative('/project/root', '%s') is correct and optimised`, normalPath => {
    const rootDir = p('/project/root');
    const expected = mockPathModule.relative(rootDir, normalPath);
    pathRelative.mockClear();
    expect(fastPath.relative(rootDir, normalPath)).toEqual(expected);
    expect(pathRelative).not.toHaveBeenCalled();
  });

  describe.each([p('/project/root'), p('/')])('root: %s', rootDir => {
    beforeEach(() => {
      pathRelative.mockClear();
    });

    test.each([
      p('/project/root/../root2/../root3/foo'),
      p('/project/baz/foobar'),
      p('/project/rootfoo/baz'),
      p('/project/root/./baz/foo/bar'),
      p('/project/root/a./../foo'),
      p('/project/root/../a./foo'),
      p('/project/root/.././foo'),
    ])(
      `relative('${rootDir}', '%s') falls back to path.relative`,
      normalPath => {
        const expected = mockPathModule.relative(rootDir, normalPath);
        pathRelative.mockClear();
        expect(fastPath.relative(rootDir, normalPath)).toEqual(expected);
        expect(pathRelative).toHaveBeenCalled();
      },
    );

    test.each([
      p('..'),
      p('../..'),
      p('normal/path'),
      p('../normal/path'),
      p('../../normal/path'),
      p('../../../normal/path'),
    ])(`resolve('${rootDir}', '%s') matches path.resolve`, normalPath => {
      expect(fastPath.resolve(rootDir, normalPath)).toEqual(
        mockPathModule.resolve(rootDir, normalPath),
      );
    });
  });
});
