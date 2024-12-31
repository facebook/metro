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

import type {
  WatchmanClockResponse,
  WatchmanSubscribeResponse,
  WatchmanWatchResponse,
} from 'fb-watchman';

import WatchmanWatcher from '../WatchmanWatcher';
import EventEmitter from 'events';

class MockClient extends EventEmitter {
  command: JestMockFn<$ReadOnlyArray<$FlowFixMe>, mixed> = jest.fn();
}
const mockClient = new MockClient();

const cmdCallback = <T>(err: ?Error, result: Partial<T>): void => {
  expect(mockClient.command.mock.lastCall[1]).toEqual(expect.any(Function));
  mockClient.command.mock.lastCall[1](err, result);
};

// Convenience function to write paths with posix separators but convert them
// to system separators, and prepend a mock drive letter to absolute paths on
// Windows.
const p: string => string = filePath =>
  process.platform === 'win32'
    ? filePath.replaceAll('/', '\\').replace(/^\\/, 'C:\\')
    : filePath;

// Format a posix path as a Watchman-native path on the current platform, i.e.,
// on Windows, drive letters on absolute paths, but posix-style separators.
// This should be used for mocking Watchman *output*.
const wp: string => string = filePath =>
  process.platform === 'win32' ? filePath.replace(/^\//, 'C:/') : filePath;

jest.mock('fb-watchman', () => ({
  Client: jest.fn().mockImplementation(() => mockClient),
}));

describe('WatchmanWatcher', () => {
  test('initializes with watch-project, clock, subscribe', () => {
    const watchmanWatcher = new WatchmanWatcher(p('/project/subdir/js'), {
      dot: true,
      ignored: null,
      globs: ['**/*.js'],
      watchmanDeferStates: ['busy'],
    });
    let isSettled = false;
    const startPromise = watchmanWatcher
      .startWatching()
      .finally(() => (isSettled = true));

    expect(mockClient.command).toHaveBeenCalledWith(
      ['watch-project', p('/project/subdir/js')],
      expect.any(Function),
    );
    cmdCallback<WatchmanWatchResponse>(null, {
      watch: wp('/project'),
      relative_path: wp('subdir/js'),
    });

    expect(mockClient.command).toHaveBeenCalledWith(
      ['clock', p('/project')],
      expect.any(Function),
    );
    cmdCallback<WatchmanClockResponse>(null, {
      clock: 'c:1629095304.251049',
    });

    expect(mockClient.command).toHaveBeenCalledWith(
      [
        'subscribe',
        p('/project'),
        watchmanWatcher.subscriptionName,
        {
          defer: ['busy'],
          fields: ['name', 'exists', 'new', 'type', 'size', 'mtime_ms'],
          relative_root: p('subdir/js'),
          since: 'c:1629095304.251049',
        },
      ],
      expect.any(Function),
    );

    // Promise should not settle until we get a subscribe response.
    expect(isSettled).toBe(false);

    cmdCallback<WatchmanSubscribeResponse>(null, {});

    // Return to assert promise resolves, not rejects
    return startPromise;
  });

  describe('getPauseReason', () => {
    let watchmanWatcher: WatchmanWatcher;
    let startPromise: Promise<void>;

    beforeEach(async () => {
      watchmanWatcher = new WatchmanWatcher(p('/project/subdir/js'), {
        dot: true,
        ignored: null,
        globs: ['**/*.js'],
        watchmanDeferStates: ['busy'],
      });
      startPromise = watchmanWatcher.startWatching();
      cmdCallback<WatchmanWatchResponse>(null, {
        watch: wp('/project'),
        relative_path: wp('subdir/js'),
      });
      cmdCallback<WatchmanClockResponse>(null, {
        clock: 'c:123',
      });
    });

    afterEach(() => {
      return startPromise;
    });

    test('subscribe response is initally deferred', () => {
      cmdCallback<WatchmanSubscribeResponse>(null, {
        'asserted-states': ['busy'],
      });
      expect(watchmanWatcher.getPauseReason()).toMatch(/busy/);
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-leave': 'busy',
      });
      expect(watchmanWatcher.getPauseReason()).toBe(null);
    });

    test('unknown states are ignored', () => {
      cmdCallback<WatchmanSubscribeResponse>(null, {
        'asserted-states': [],
      });
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-enter': 'unknown-state',
      });
      expect(watchmanWatcher.getPauseReason()).toBe(null);
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-enter': 'busy',
      });
      expect(watchmanWatcher.getPauseReason()).toMatch(/busy/);
    });

    test('known states are reported and cleared', () => {
      cmdCallback<WatchmanSubscribeResponse>(null, {
        'asserted-states': [],
      });
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-enter': 'busy',
      });
      expect(watchmanWatcher.getPauseReason()).toMatch(/busy/);
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-leave': 'busy',
      });
      expect(watchmanWatcher.getPauseReason()).toBe(null);
    });

    test('missing asserted-states in subscribe response', () => {
      cmdCallback<WatchmanSubscribeResponse>(null, {});
      expect(watchmanWatcher.getPauseReason()).toBe(null);
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-enter': 'busy',
      });
      // We don't know the original states, so don't attempt to report states.
      expect(watchmanWatcher.getPauseReason()).toBe(null);
    });

    test('empty asserted-states in subscribe response', () => {
      cmdCallback<WatchmanSubscribeResponse>(null, {
        'asserted-states': [],
      });
      expect(watchmanWatcher.getPauseReason()).toBe(null);
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-enter': 'busy',
      });
      expect(watchmanWatcher.getPauseReason()).toMatch(/busy/);
    });
  });
});
