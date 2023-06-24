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

  beforeEach(() => {
    jest.resetModules();
    mockPathModule = jest.requireActual<{}>('path')[platform];
    fastPath = require('../fast_path');
  });

  describe.each([p('/project/root'), p('/')])('root: %s', rootDir => {
    test.each([
      p('/project/root/baz/foobar'),
      p('/project/baz/foobar'),
      p('/project/rootfoo/baz'),
    ])(`relative('${rootDir}', '%s') matches path.relative`, normalPath => {
      expect(fastPath.relative(rootDir, normalPath)).toEqual(
        mockPathModule.relative(rootDir, normalPath),
      );
    });

    test.each([
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
