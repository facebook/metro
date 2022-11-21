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

import type {WatcherOptions} from '../common';
import type {Stats} from 'fs';

import NodeWatcher from '../NodeWatcher';
import FSEventsWatcher from '../FSEventsWatcher';
import WatchmanWatcher from '../WatchmanWatcher';
import {execSync} from 'child_process';
import os from 'os';
import {promises as fsPromises} from 'fs';
import invariant from 'invariant';
import {join} from 'path';
const {mkdtemp, mkdir, writeFile, rm, realpath, symlink, unlink} = fsPromises;

jest.useRealTimers();

// At runtime we use a more sophisticated + robust Watchman capability check,
// but this simple heuristic is fast to check, synchronous (we can't
// asynchronously skip tests: https://github.com/facebook/jest/issues/8604),
// and will tend to exercise our Watchman tests whenever possible.
const isWatchmanOnPath = () => {
  try {
    execSync(os.platform() === 'windows' ? 'where watchman' : 'which watchman');
    return true;
  } catch {
    return false;
  }
};

// `null` Watchers will be marked as skipped tests.
const WATCHERS: $ReadOnly<{
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

test('FSEventsWatcher is supported if and only if darwin', () => {
  expect(FSEventsWatcher.isSupported()).toBe(os.platform() === 'darwin');
});

describe.each(Object.keys(WATCHERS))(
  'Watcher integration tests: %s',
  watcherName => {
    let appRoot;
    let cookieCount = 1;
    let watcherInstance;
    let watchRoot;
    let nextEvent: (
      afterFn: () => Promise<void>,
    ) => Promise<{eventType: string, path: string, stat?: Stats}>;
    let untilEvent: (
      afterFn: () => Promise<void>,
      expectedPath: string,
      expectedEvent: 'add' | 'delete' | 'change',
    ) => Promise<void>;

    const Watcher = WATCHERS[watcherName];

    // If all tests are skipped, Jest will not run before/after hooks either.
    const maybeTest = Watcher ? test : test.skip;

    beforeAll(async () => {
      const tmpDir = await mkdtemp(
        join(os.tmpdir(), `metro-watcher-${watcherName}-test-`),
      );

      // os.tmpdir() on macOS gives us a symlink /var/foo -> /private/var/foo,
      // we normalise it with realpath so that watchers report predictable
      // root-relative paths for change events.
      watchRoot = await realpath(tmpDir);
      await writeFile(join(watchRoot, '.watchmanconfig'), '{}');

      // Perform all writes one level deeper than the watch root, so that we
      // can reset file fixtures without re-establishing a watch.
      appRoot = join(watchRoot, 'app');

      const opts: WatcherOptions = {
        dot: true,
        glob: [],
        // We need to ignore `.watchmanconfig` to keep these tests stable.
        // Even though we write it before initialising watchers, OS-level
        // delays/debouncing(?) can mean the write is *sometimes* reported by
        // the watcher.
        ignored: /\.watchmanconfig/,
        watchmanDeferStates: [],
      };

      nextEvent = afterFn =>
        Promise.all([
          new Promise((resolve, reject) => {
            watcherInstance.once('all', (eventType, path, root, stat) => {
              if (root !== watchRoot) {
                reject(new Error(`Expected root ${watchRoot}, got ${root}`));
              }
              resolve({eventType, path, stat});
            });
          }),
          afterFn(),
        ]).then(([event]) => event);

      untilEvent = (afterFn, expectedPath, expectedEventType) =>
        Promise.all([
          new Promise(async (resolve, reject) => {
            const listener = (eventType: string, path: string) => {
              if (eventType === expectedEventType && path === expectedPath) {
                watcherInstance.removeListener('all', listener);
                resolve();
              }
            };
            watcherInstance.on('all', listener);
          }),
          afterFn(),
        ]).then(() => {});

      invariant(Watcher, 'Use of maybeTest should ensure Watcher is non-null');
      watcherInstance = new Watcher(watchRoot, opts);
      await new Promise(resolve => {
        watcherInstance.on('ready', resolve);
      });
      // Sometimes the creation of `app` is reported after 'ready', so wait for
      // a sync cookie and discard anything reported before then.
      const cookieName = `cookie-${++cookieCount}`;
      await untilEvent(
        () => writeFile(join(watchRoot, cookieName), ''),
        cookieName,
        'add',
      );
    });

    beforeEach(async () => {
      expect(await nextEvent(() => mkdir(appRoot))).toMatchObject({
        path: 'app',
        eventType: 'add',
      });
    });

    afterEach(async () => {
      // Ensure there are no unexpected events after a test completes, to
      // catch double-counting, unexpected symlink traversal, etc.
      const cookieName = `cookie-${++cookieCount}`;
      expect(
        await nextEvent(() => writeFile(join(watchRoot, cookieName), '')),
      ).toMatchObject({path: cookieName, eventType: 'add'});
      // Cleanup and wait until the app root deletion is reported - this should
      // be the last cleanup event emitted.
      await untilEvent(() => rm(appRoot, {recursive: true}), 'app', 'delete');
    });

    afterAll(async () => {
      await watcherInstance.close();
      await rm(watchRoot, {recursive: true});
    });

    maybeTest('detects a new, changed, deleted file', async () => {
      const testFile = join(appRoot, 'test.js');
      const relativePath = join('app', 'test.js');
      expect(
        await nextEvent(() => writeFile(testFile, 'hello world')),
      ).toStrictEqual({
        path: relativePath,
        eventType: 'add',
        stat: expect.any(Object),
      });
      expect(
        await nextEvent(() => writeFile(testFile, 'brave new world')),
      ).toStrictEqual({
        path: relativePath,
        eventType: 'change',
        stat: expect.any(Object),
      });
      expect(await nextEvent(() => unlink(testFile))).toStrictEqual({
        path: relativePath,
        eventType: 'delete',
        stat: undefined,
      });
    });

    // $FlowFixMe: Update RN's Jest libdefs so that `skip` has an `each` static
    maybeTest.each([
      join('.', 'foo'),
      join('.', 'foo', 'bar.js'),
      join('.', 'not-exists'),
    ])('detects new and deleted symlink to %s', async target => {
      const newLink = join(appRoot, 'newlink');
      const relativePath = join('app', 'newlink');
      expect(await nextEvent(() => symlink(target, newLink))).toStrictEqual({
        path: relativePath,
        eventType: 'add',
        stat: expect.any(Object),
      });
      expect(await nextEvent(() => unlink(newLink))).toStrictEqual({
        path: relativePath,
        eventType: 'delete',
        stat: undefined,
      });
    });
  },
);
