/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

import type {WatcherBackendChangeEvent} from '../flow-types';
import type {Dirent, FSWatcher, Stats} from 'fs';

import {AbstractWatcher} from './AbstractWatcher';
import {includedByGlob, typeFromStat} from './common';
import {promises as fsPromises, watch} from 'fs';
import {platform} from 'os';
import * as path from 'path';

// eslint-disable-next-line import/no-commonjs
const debug = require('debug')('Metro:NativeWatcher');

const TOUCH_EVENT = 'touch';
const DELETE_EVENT = 'delete';

export type ChangeEventEntry = $ReadOnly<{
  relativePath: string,
  stat: Stats | null,
}>;

/**
 * NativeWatcher uses Node's native fs.watch API with recursive: true.
 *
 * Supported on macOS (and potentially Windows), because both natively have a
 * concept of recurisve watching, via FSEvents and ReadDirectoryChangesW
 * respectively. Notably Linux lacks this capability at the OS level.
 *
 * Node.js has at times supported the `recursive` option to fs.watch on Linux
 * by walking the directory tree and creating a watcher on each directory, but
 * this fits poorly with the synchronous `watch` API - either it must block for
 * arbitrarily large IO, or it may drop changes after `watch` returns. See:
 * https://github.com/nodejs/node/issues/48437
 *
 * Therefore, we retain a fallback to our own application-level recursive
 * FallbackWatcher for Linux, which has async `startWatching`.
 *
 * On Windows, this watcher could be used in principle, but needs work around
 * some Windows-specific edge cases handled in FallbackWatcher, like
 * deduping file change events, ignoring directory changes, and handling EPERM.
 */
export default class NativeWatcher extends AbstractWatcher {
  #fsWatcher: ?FSWatcher;
  #tickHandle: ?TimeoutID;
  #inputQueue: string[];
  #outputQueue: Omit<WatcherBackendChangeEvent, 'root'>[];

  static isSupported(): boolean {
    return platform() === 'darwin';
  }

  constructor(
    dir: string,
    opts: $ReadOnly<{
      ignored: ?RegExp,
      globs: $ReadOnlyArray<string>,
      dot: boolean,
      ...
    }>,
  ) {
    if (!NativeWatcher.isSupported) {
      throw new Error('This watcher can only be used on macOS');
    }
    super(dir, opts);
    this.#tickHandle = null;
    this.#inputQueue = [];
    this.#outputQueue = [];
  }

  async startWatching(): Promise<void> {
    this.#fsWatcher = watch(
      this.root,
      {
        // Don't hold the process open if we forget to close()
        persistent: false,
        // FSEvents or ReadDirectoryChangesW should mean this is cheap and
        // ~instant on macOS or Windows.
        recursive: true,
      },
      (_event, relativePath) => this._receiveChangedPath(relativePath),
    );

    debug('Watching %s', this.root);
  }

  /**
   * End watching.
   */
  async stopWatching(): Promise<void> {
    await super.stopWatching();
    if (this.#fsWatcher) {
      this.#fsWatcher.close();
    }
  }

  _receiveChangedPath(relativePath: string) {
    if (this.doIgnore(relativePath)) {
      debug('Ignoring event on %s (root: %s)', relativePath, this.root);
      return;
    }
    debug('Handling event on %s (root: %s)', relativePath, this.root);
    this.#inputQueue.push(relativePath);
    if (!this.#tickHandle) {
      this.#tickHandle = setTimeout(() => this._processTick());
    }
  }

  _sendFileEvent(event: Omit<WatcherBackendChangeEvent, 'root'>) {
    this.#outputQueue.push(event);
    if (!this.#tickHandle) {
      this.#tickHandle = setTimeout(() => this._processTick());
    }
  }

  async _processTick() {
    // Every tick we process inputs (fs.watch changed file events),
    this.#tickHandle = null;
    try {
      await this._processInputBatch();
    } catch (error) {
      this.emitError(error);
    }
    // Then we process output events (this.emitFileEvent)
    const outputQueue = this.#outputQueue;
    this.#outputQueue = [];
    for (const changeEvent of outputQueue) {
      this.emitFileEvent(changeEvent);
    }
  }

  async _processInputBatch() {
    const hardlinkCandidates: string[] = [];
    const inputQueue = this.#inputQueue.map(
      async (relativePath: string): Promise<ChangeEventEntry | null> => {
        const absolutePath = path.resolve(this.root, relativePath);
        try {
          return {
            relativePath,
            stat: await lstatOptional(absolutePath),
          };
        } catch (error) {
          this.emitError(error);
          return null;
        }
      },
    );
    this.#inputQueue.length = 0;

    const changeEvents = (await Promise.all(inputQueue)).filter(
      (change: ChangeEventEntry | null) => change != null,
    );
    for (const {relativePath, stat} of changeEvents) {
      if (!stat) {
        this.emitFileEvent({event: DELETE_EVENT, relativePath});
        continue;
      }

      const type = typeFromStat(stat);
      // Ignore files of an unrecognized type or by globs
      if (!type || !includedByGlob(type, this.globs, this.dot, relativePath)) {
        continue;
      }

      // If we have a directory that's potentially been hardlinked, it's a candidate
      // for manual crawling if there's no other event that has a child path in this directory.
      // If we have a child path, then we can rely on `fs.watch` reporting changes for
      // this directory's files
      if (type === 'd' && isMaybeHardlinked(stat)) {
        const hasChildEntry = changeEvents.some(event => {
          return (
            event.stat != null &&
            (!isMaybeHardlinked(stat) || stat.isDirectory()) &&
            event.relativePath.startsWith(relativePath + path.sep)
          );
        });
        if (!hasChildEntry) {
          hardlinkCandidates.push(relativePath);
        }
      }

      this._sendFileEvent({
        event: TOUCH_EVENT,
        relativePath,
        metadata: {
          type,
          modifiedTime: stat.mtime.getTime(),
          size: stat.size,
        },
      });
    }

    for (const hardlinkRelativePath of hardlinkCandidates) {
      await this._handleHardlinkDirectory(hardlinkRelativePath);
    }
  }

  async _handleHardlinkDirectory(relativePath: string) {
    debug(
      'Crawling hardlinked directory %s (root: %s)',
      relativePath,
      this.root,
    );
    // We manually crawl each directory that may be a hardlink/clone. When this
    // happens, we don't receive change events for the directory's contents, so
    // we have to crawl it manually
    const direntQueue = [relativePath];
    let readdirPath: ?string;
    while ((readdirPath = direntQueue.pop()) != null) {
      if (readdirPath == null) {
        return;
      }
      let entries: $ReadOnlyArray<Dirent>;
      try {
        const absolutePath = path.join(this.root, readdirPath);
        entries = await fsPromises.readdir(absolutePath, {withFileTypes: true});
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          this.emitError(error);
        } else if (readdirPath !== relativePath) {
          // A directory could be deleted while we're still scanning
          // Requeue it for updates if we lose it while crawling
          this._receiveChangedPath(readdirPath);
        }
        continue;
      }
      for (const dirent of entries) {
        if (dirent.isDirectory()) {
          // We can ignore directories, to avoid triggering nested hardlink
          // handling, but also since the parent FileMap ultimately discards
          // directory events anyway
          const relativePath = path.join(readdirPath, dirent.name.toString());
          direntQueue.push(relativePath);
        } else if (dirent.isFile() || dirent.isSymbolicLink()) {
          const relativePath = path.join(readdirPath, dirent.name.toString());
          this._receiveChangedPath(relativePath);
        }
      }
    }
  }
}

const isMaybeHardlinked = (stat: Stats): boolean => stat.nlink > 1;

async function lstatOptional(absolutePath: string): Promise<Stats | null> {
  try {
    return await fsPromises.lstat(absolutePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    } else {
      return null;
    }
  }
}
