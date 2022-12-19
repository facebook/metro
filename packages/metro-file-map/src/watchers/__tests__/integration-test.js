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

import type {EventHelpers} from './helpers';
import type {WatcherOptions} from '../common';

import FSEventsWatcher from '../FSEventsWatcher';
import {createTempWatchRoot, startWatching, WATCHERS} from './helpers';
import os from 'os';
import {promises as fsPromises} from 'fs';
import {join} from 'path';
const {mkdir, writeFile, rm, symlink, unlink} = fsPromises;

test('FSEventsWatcher is supported if and only if darwin', () => {
  expect(FSEventsWatcher.isSupported()).toBe(os.platform() === 'darwin');
});

describe.each(Object.keys(WATCHERS))(
  'Watcher integration tests: %s',
  watcherName => {
    let appRoot;
    let cookieCount = 1;
    let watchRoot;
    let stopWatching;
    let eventHelpers: EventHelpers;

    // If all tests are skipped, Jest will not run before/after hooks either.
    const maybeTest = WATCHERS[watcherName] ? test : test.skip;

    beforeAll(async () => {
      watchRoot = await createTempWatchRoot(watcherName);

      // 'app' will be created and deleted before and after each test.
      appRoot = join(watchRoot, 'app');

      // 'existing' will *not* be reset between tests. These are fixtures used
      // for testing the behaviour of the watchers on files that existed before
      // the watcher was started. Tests should touch only distinct subsets of
      // these files to ensure that tests remain isolated.
      await mkdir(join(watchRoot, 'existing'));
      await Promise.all([
        writeFile(join(watchRoot, 'existing', 'file-to-delete'), ''),
        writeFile(join(watchRoot, 'existing', 'file-to-modify'), ''),
      ]);

      // Short delay to ensure that 'add' events for the files above are not
      // reported by the OS to the watcher we haven't established yet.
      await new Promise(resolve => setTimeout(resolve, 10));

      const opts: WatcherOptions = {
        dot: true,
        glob: [],
        // We need to ignore `.watchmanconfig` to keep these tests stable.
        // Even though we write it before initialising watchers, OS-level
        // delays/debouncing(?) can mean the write is *sometimes* reported by
        // the watcher.
        ignored: /(\.watchmanconfig|ignored-)/,
        watchmanDeferStates: [],
      };

      ({stopWatching, eventHelpers} = await startWatching(
        watcherName,
        watchRoot,
        opts,
      ));
    });

    beforeEach(async () => {
      // Discard events before app add - sometimes pre-init events are reported
      // after the watcher is ready.
      expect(await eventHelpers.nextEvent(() => mkdir(appRoot))).toStrictEqual({
        path: 'app',
        eventType: 'add',
        metadata: expect.any(Object),
      });
    });

    afterEach(async () => {
      // Ensure there are no unexpected events after a test completes, to
      // catch double-counting, unexpected symlink traversal, etc.
      const cookieName = `cookie-${++cookieCount}`;
      expect(
        await eventHelpers.nextEvent(() =>
          writeFile(join(watchRoot, cookieName), ''),
        ),
      ).toMatchObject({path: cookieName, eventType: 'add'});
      // Cleanup and wait until the app root deletion is reported - this should
      // be the last cleanup event emitted.
      await eventHelpers.untilEvent(
        () => rm(appRoot, {recursive: true}),
        'app',
        'delete',
      );
    });

    afterAll(async () => {
      await stopWatching();
      await rm(watchRoot, {recursive: true});
    });

    maybeTest('detects a new, changed, deleted file', async () => {
      const testFile = join(appRoot, 'test.js');
      const relativePath = join('app', 'test.js');
      expect(
        await eventHelpers.nextEvent(() => writeFile(testFile, 'hello world')),
      ).toStrictEqual({
        path: relativePath,
        eventType: 'add',
        metadata: {
          type: 'f',
          modifiedTime: expect.any(Number),

          // T138670812 Reported inconsistently by NodeWatcher as 0 or 11
          // due to write/stat race. Should either fix, document, or remove.
          size: expect.any(Number),
        },
      });
      expect(
        await eventHelpers.nextEvent(() =>
          writeFile(testFile, 'brave new world'),
        ),
      ).toStrictEqual({
        path: relativePath,
        eventType: 'change',
        metadata: expect.any(Object),
      });
      expect(
        await eventHelpers.nextEvent(() => unlink(testFile)),
      ).toStrictEqual({
        path: relativePath,
        eventType: 'delete',
        metadata: undefined,
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
      expect(
        await eventHelpers.nextEvent(() => symlink(target, newLink)),
      ).toStrictEqual({
        path: relativePath,
        eventType: 'add',
        metadata: {
          type: 'l',
          modifiedTime: expect.any(Number),
          size: expect.any(Number),
        },
      });
      expect(await eventHelpers.nextEvent(() => unlink(newLink))).toStrictEqual(
        {
          path: relativePath,
          eventType: 'delete',
          metadata: undefined,
        },
      );
    });

    maybeTest('detects deletion of a pre-existing file', async () => {
      expect(
        await eventHelpers.nextEvent(() =>
          unlink(join(watchRoot, 'existing', 'file-to-delete')),
        ),
      ).toStrictEqual({
        path: join('existing', 'file-to-delete'),
        eventType: 'delete',
        metadata: undefined,
      });
    });

    maybeTest('detects change to a pre-existing file as a change', async () => {
      expect(
        await eventHelpers.nextEvent(() =>
          writeFile(join(watchRoot, 'existing', 'file-to-modify'), 'changed'),
        ),
      ).toStrictEqual({
        path: join('existing', 'file-to-modify'),
        eventType: 'change',
        metadata: expect.any(Object),
      });
    });

    maybeTest(
      'emits deletion for all files when a directory is deleted',
      async () => {
        await eventHelpers.allEvents(
          async () => {
            await mkdir(join(appRoot, 'subdir', 'subdir2'), {recursive: true});
            await Promise.all([
              writeFile(join(appRoot, 'subdir', 'ignored-file.js'), ''),
              writeFile(join(appRoot, 'subdir', 'deep.js'), ''),
              writeFile(join(appRoot, 'subdir', 'subdir2', 'deeper.js'), ''),
            ]);
          },
          [
            [join('app', 'subdir'), 'add'],
            [join('app', 'subdir', 'subdir2'), 'add'],
            [join('app', 'subdir', 'deep.js'), 'add'],
            [join('app', 'subdir', 'subdir2', 'deeper.js'), 'add'],
          ],
          {rejectUnexpected: true},
        );

        await eventHelpers.allEvents(
          async () => {
            await rm(join(appRoot, 'subdir'), {recursive: true});
          },
          [
            [join('app', 'subdir'), 'delete'],
            [join('app', 'subdir', 'subdir2'), 'delete'],
            [join('app', 'subdir', 'deep.js'), 'delete'],
            [join('app', 'subdir', 'subdir2', 'deeper.js'), 'delete'],
          ],
          {rejectUnexpected: true},
        );
      },
    );
  },
);
