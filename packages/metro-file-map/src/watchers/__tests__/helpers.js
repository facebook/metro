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

import type {ChangeEventMetadata} from '../../flow-types';
import type {WatcherOptions} from '../common';

import FSEventsWatcher from '../FSEventsWatcher';
import NodeWatcher from '../NodeWatcher';
import WatchmanWatcher from '../WatchmanWatcher';
import {execSync} from 'child_process';
import {promises as fsPromises} from 'fs';
import invariant from 'invariant';
import os from 'os';
import {join} from 'path';

jest.useRealTimers();

const {mkdtemp, writeFile} = fsPromises;

// At runtime we use a more sophisticated + robust Watchman capability check,
// but this simple heuristic is fast to check, synchronous (we can't
// asynchronously skip tests: https://github.com/facebook/jest/issues/8604),
// and will tend to exercise our Watchman tests whenever possible.
const isWatchmanOnPath = () => {
  try {
    execSync(
      os.platform() === 'win32' ? 'where.exe /Q watchman' : 'which watchman',
    );
    return true;
  } catch {
    return false;
  }
};

// `null` Watchers will be marked as skipped tests.
export const WATCHERS: $ReadOnly<{
  [key: string]:
    | Class<NodeWatcher>
    | Class<FSEventsWatcher>
    | Class<WatchmanWatcher>
    | null,
}> = {
  Node: NodeWatcher,
  Watchman: isWatchmanOnPath() ? WatchmanWatcher : null,
  FSEvents: FSEventsWatcher.isSupported() ? FSEventsWatcher : null,
};

export type EventHelpers = {
  nextEvent: (afterFn: () => Promise<void>) => Promise<{
    eventType: string,
    path: string,
    metadata?: ChangeEventMetadata,
  }>,
  untilEvent: (
    afterFn: () => Promise<void>,
    expectedPath: string,
    expectedEvent: 'add' | 'delete' | 'change',
  ) => Promise<void>,
  allEvents: (
    afterFn: () => Promise<void>,
    events: $ReadOnlyArray<[string, 'add' | 'delete' | 'change']>,
    opts?: {rejectUnexpected: boolean},
  ) => Promise<void>,
};

export const createTempWatchRoot = async (
  watcherName: string,
  watchmanConfig: {[key: string]: mixed} | false = {},
): Promise<string> => {
  const tmpDir = await mkdtemp(
    join(os.tmpdir(), `metro-watcher-${watcherName}-test-`),
  );

  // os.tmpdir() on macOS gives us a symlink /var/foo -> /private/var/foo,
  // we normalise it with realpath so that watchers report predictable
  // root-relative paths for change events.
  const watchRoot = await fsPromises.realpath(tmpDir);
  if (watchmanConfig) {
    await writeFile(
      join(watchRoot, '.watchmanconfig'),
      JSON.stringify(watchmanConfig),
    );
  }

  return watchRoot;
};

export const startWatching = async (
  watcherName: string,
  watchRoot: string,
  opts: WatcherOptions,
): (Promise<{
  eventHelpers: EventHelpers,
  stopWatching: () => Promise<void>,
}>) => {
  const Watcher = WATCHERS[watcherName];
  invariant(Watcher != null, `Watcher ${watcherName} is not supported`);
  const watcherInstance = new Watcher(watchRoot, opts);

  await new Promise(resolve => {
    watcherInstance.once('ready', resolve);
  });

  const eventHelpers: EventHelpers = {
    nextEvent: afterFn =>
      Promise.all([
        new Promise<{
          eventType: string,
          metadata?: ChangeEventMetadata,
          path: string,
        }>((resolve, reject) => {
          const listener = (
            eventType: string,
            path: string,
            root: string,
            metadata?: ChangeEventMetadata,
          ) => {
            if (path === '') {
              // FIXME: FSEventsWatcher sometimes reports 'change' events to
              // the watch root.
              return;
            }
            watcherInstance.removeListener('all', listener);
            if (root !== watchRoot) {
              reject(new Error(`Expected root ${watchRoot}, got ${root}`));
            }

            resolve({eventType, path, metadata});
          };
          watcherInstance.on('all', listener);
        }),
        afterFn(),
      ]).then(([event]) => event),

    untilEvent: (afterFn, expectedPath, expectedEventType) =>
      eventHelpers.allEvents(afterFn, [[expectedPath, expectedEventType]], {
        rejectUnexpected: false,
      }),

    // $FlowFixMe[incompatible-use]
    allEvents: (afterFn, expectedEvents, {rejectUnexpected = true} = {}) =>
      Promise.all([
        new Promise((resolve, reject) => {
          const tupleToKey = (tuple: $ReadOnlyArray<string>) =>
            tuple.join('\0');
          const allEventKeys = new Set(
            expectedEvents.map(tuple => tupleToKey(tuple)),
          );
          const listener = (eventType: string, path: string) => {
            if (path === '') {
              // FIXME: FSEventsWatcher sometimes reports 'change' events to
              // the watch root.
              return;
            }
            const receivedKey = tupleToKey([path, eventType]);
            if (allEventKeys.has(receivedKey)) {
              allEventKeys.delete(receivedKey);
              if (allEventKeys.size === 0) {
                watcherInstance.removeListener('all', listener);
                resolve();
              }
            } else if (rejectUnexpected) {
              watcherInstance.removeListener('all', listener);
              reject(new Error(`Unexpected event: ${eventType} ${path}.`));
            }
          };
          watcherInstance.on('all', listener);
        }),
        afterFn(),
      ]).then(() => {}),
  };

  return {
    eventHelpers,
    stopWatching: async () => {
      await watcherInstance.close();
    },
  };
};
