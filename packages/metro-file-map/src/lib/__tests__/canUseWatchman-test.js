/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

import canUseWatchman from '../canUseWatchman';

const mockExecFile = jest.fn();
jest.mock('child_process', () => ({
  execFile: (...args) => mockExecFile(...args),
}));

describe('canUseWatchman', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('executes watchman --version and returns true on success', async () => {
    mockExecFile.mockImplementation((file, args, cb) => {
      expect(file).toBe('watchman');
      expect(args).toStrictEqual(['--version']);
      cb(null, {stdout: 'v123'});
    });
    expect(await canUseWatchman()).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith(
      'watchman',
      ['--version'],
      expect.any(Function),
    );
  });

  it('returns false when execFile fails', async () => {
    mockExecFile.mockImplementation((file, args, cb) => {
      cb(new Error());
    });
    expect(await canUseWatchman()).toBe(false);
    expect(mockExecFile).toHaveBeenCalled();
  });
});
