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
import type {EventHelpers} from './helpers';

import NativeWatcher from '../NativeWatcher';
import {WATCHERS, createTempWatchRoot, startWatching} from './helpers';
import {promises as fsPromises} from 'fs';
import os from 'os';
import {join} from 'path';

const {mkdir, writeFile, rm, symlink, unlink} = fsPromises;

jest.setTimeout(10 * 1000);

test('NativeWatcher is supported if and only if darwin', () => {
  expect(NativeWatcher.isSupported()).toBe(os.platform() === 'darwin');
});

type WatcherKey = keyof typeof WATCHERS;

describe.each(Object.keys(WATCHERS))(
  'Watcher integration tests: %s',
  (watcherName: WatcherKey) => {
    let appRoot;
    let cookieCount = 1;
    let watchRoot;
    let stopWatching;
    let eventHelpers: EventHelpers;

    // If all tests are skipped, Jest will not run before/after hooks either.
    const maybeTest = WATCHERS[watcherName] ? test : test.skip;

    async function waitForCookie(
      rootRelativeDirPath?: ?string,
      opts?: {rejectUnexpected: boolean} = {rejectUnexpected: true},
    ) {
      const cookieName = `cookie-${++cookieCount}`;
      const relPath =
        rootRelativeDirPath != null
          ? join(rootRelativeDirPath, cookieName)
          : cookieName;
      const absPath = join(watchRoot, relPath);

      await eventHelpers.allEvents(
        () => writeFile(absPath, ''),
        [[relPath, 'touch']],
        opts,
      );
      expect(await eventHelpers.nextEvent(() => rm(absPath))).toMatchObject({
        path: relPath,
        eventType: 'delete',
      });
    }

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
        writeFile(join(watchRoot, 'existing', 'file-to-delete.js'), ''),
        writeFile(join(watchRoot, 'existing', 'file-to-modify.js'), ''),
        symlink('target', join(watchRoot, 'existing', 'symlink-to-delete')),
      ]);

      // Short delay to ensure that 'touch' events for the files above are not
      // reported by the OS to the watcher we haven't established yet.
      await new Promise(resolve => setTimeout(resolve, 100));

      const opts: WatcherOptions = {
        dot: true,
        globs: ['**/package.json', '**/*.js', '**/cookie-*'],
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
      await mkdir(appRoot);
      // We can't observe the creation of the app root directly since backends
      // don't emit directory events. Instead, create and delete a cookie.
      await waitForCookie('app');
    });

    afterEach(async () => {
      // Ensure there are no unexpected events after a test completes, to
      // catch double-counting, unexpected symlink traversal, etc.
      const cookieName = `cookie-${++cookieCount}`;
      expect(
        await eventHelpers.nextEvent(() =>
          writeFile(join(watchRoot, cookieName), ''),
        ),
      ).toMatchObject({path: cookieName, eventType: 'touch'});

      // Clean up by deleting the app root.
      await rm(appRoot, {recursive: true});
      // Write a regular file to the place we'd normally have the app root
      // directory. This guarantees that the directory has been deleted, and
      // gives us something we can await the deletion of to ensure all events
      // have been flushed.
      const cookieName2 = `cookie-${cookieCount}`;
      await eventHelpers.untilEvent(
        async () => {
          await writeFile(join(watchRoot, cookieName2), '');
        },
        cookieName2,
        'touch',
      );
      // Finally, await the deletion of the regular file we just created.
      await eventHelpers.untilEvent(
        () => rm(join(watchRoot, cookieName2)),
        cookieName2,
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
        eventType: 'touch',
        metadata: {
          type: 'f',
          modifiedTime: expect.any(Number),

          // T138670812 Reported inconsistently by FallbackWatcher as 0 or 11
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
        eventType: 'touch',
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
        eventType: 'touch',
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
          unlink(join(watchRoot, 'existing', 'file-to-delete.js')),
        ),
      ).toStrictEqual({
        path: join('existing', 'file-to-delete.js'),
        eventType: 'delete',
        metadata: undefined,
      });
    });

    maybeTest('detects deletion of a pre-existing symlink', async () => {
      expect(
        await eventHelpers.nextEvent(() =>
          unlink(join(watchRoot, 'existing', 'symlink-to-delete')),
        ),
      ).toStrictEqual({
        path: join('existing', 'symlink-to-delete'),
        eventType: 'delete',
        metadata: undefined,
      });
    });

    maybeTest('detects change to a pre-existing file as a change', async () => {
      expect(
        await eventHelpers.nextEvent(() =>
          writeFile(
            join(watchRoot, 'existing', 'file-to-modify.js'),
            'changed',
          ),
        ),
      ).toStrictEqual({
        path: join('existing', 'file-to-modify.js'),
        eventType: 'touch',
        metadata: expect.any(Object),
      });
    });

    maybeTest('detects changes to files in a new directory', async () => {
      expect(
        await eventHelpers.nextEvent(async () => {
          await mkdir(join(watchRoot, 'newdir'));
          await writeFile(
            join(watchRoot, 'newdir', 'file-in-new-dir.js'),
            'code',
          );
        }),
      ).toStrictEqual({
        path: join('newdir', 'file-in-new-dir.js'),
        eventType: 'touch',
        metadata: {
          modifiedTime: expect.any(Number),
          size: expect.any(Number),
          type: 'f',
        },
      });
    });

    maybeTest(
      'emits deletion for all files when a directory is deleted',
      async () => {
        if (watcherName !== 'Fallback') {
          await mkdir(join(appRoot, 'subdir', 'subdir2'), {recursive: true});
        } else {
          // FIXME: A known race in Fallback watcher where it may not be
          // watching a directory at the time a new subdirectory is created
          // means that we need to create each directory separately and ensure
          // it is watched. This could cause real-world problems when file
          // trees are created quickly - eg npm install.
          await mkdir(join(appRoot, 'subdir'));
          await waitForCookie(join('app', 'subdir'));
          await mkdir(join(appRoot, 'subdir', 'subdir2'));
          await waitForCookie(join('app', 'subdir', 'subdir2'));
        }

        await eventHelpers.allEvents(
          async () => {
            await Promise.all([
              writeFile(join(appRoot, 'subdir', 'ignored-file.js'), ''),
              writeFile(join(appRoot, 'subdir', 'deep.js'), ''),
              writeFile(join(appRoot, 'subdir', 'subdir2', 'deeper.js'), ''),
            ]);
          },
          [
            [join('app', 'subdir', 'deep.js'), 'touch'],
            [join('app', 'subdir', 'subdir2', 'deeper.js'), 'touch'],
          ],
          {rejectUnexpected: true},
        );

        await eventHelpers.allEvents(
          async () => {
            await rm(join(appRoot, 'subdir'), {recursive: true});
          },
          [
            [join('app', 'subdir', 'deep.js'), 'delete'],
            [join('app', 'subdir', 'subdir2', 'deeper.js'), 'delete'],
          ],
          // Watchers *may* emit deletion events for directories as well
          {rejectUnexpected: false},
        );
        const cookiePath = join('app', `cookie-${++cookieCount}`);

        // Allow deleted events for directories
        await eventHelpers.untilEvent(
          () => writeFile(join(watchRoot, cookiePath), ''),
          cookiePath,
          'touch',
        );
      },
    );
  },
);
