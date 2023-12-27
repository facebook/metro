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

jest.mock('fb-watchman', () => ({
  Client: jest.fn().mockImplementation(() => mockClient),
}));

describe('WatchmanWatcher', () => {
  test('initializes with watch-project, clock, subscribe', () => {
    const watchmanWatcher = new WatchmanWatcher('/project/subdir/js', {
      dot: true,
      ignored: false,
      glob: ['**/*.js'],
      watchmanDeferStates: ['busy'],
    });
    const readyListener = jest.fn();
    watchmanWatcher.on('ready', readyListener);

    expect(mockClient.command).toHaveBeenCalledWith(
      ['watch-project', '/project/subdir/js'],
      expect.any(Function),
    );
    cmdCallback<WatchmanWatchResponse>(null, {
      watch: '/project',
      relative_path: 'subdir/js',
    });

    expect(mockClient.command).toHaveBeenCalledWith(
      ['clock', '/project'],
      expect.any(Function),
    );
    cmdCallback<WatchmanClockResponse>(null, {
      clock: 'c:1629095304.251049',
    });

    expect(mockClient.command).toHaveBeenCalledWith(
      [
        'subscribe',
        '/project',
        watchmanWatcher.subscriptionName,
        {
          defer: ['busy'],
          fields: ['name', 'exists', 'new', 'type', 'size', 'mtime_ms'],
          relative_root: 'subdir/js',
          since: 'c:1629095304.251049',
        },
      ],
      expect.any(Function),
    );

    expect(readyListener).not.toHaveBeenCalled();
    cmdCallback<WatchmanSubscribeResponse>(null, {});
    expect(readyListener).toHaveBeenCalled();
  });

  describe('getPauseReason', () => {
    let watchmanWatcher: WatchmanWatcher;

    beforeEach(() => {
      watchmanWatcher = new WatchmanWatcher('/project/subdir/js', {
        dot: true,
        ignored: false,
        glob: ['**/*.js'],
        watchmanDeferStates: ['busy'],
      });
      cmdCallback<WatchmanWatchResponse>(null, {});
      cmdCallback<WatchmanClockResponse>(null, {});
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
