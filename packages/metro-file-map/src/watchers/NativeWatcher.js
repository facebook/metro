/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

import type {Dirent, FSWatcher} from 'fs';

import {AbstractWatcher} from './AbstractWatcher';
import {includedByGlob, typeFromStat} from './common';
import {promises as fsPromises, watch} from 'fs';
import {platform} from 'os';
import * as path from 'path';

// eslint-disable-next-line import/no-commonjs
const debug = require('debug')('Metro:NativeWatcher');

const TOUCH_EVENT = 'touch';
const DELETE_EVENT = 'delete';

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
      (_event, relativePath) => {
        // _event is always 'rename' on macOS, so we don't use it.
        this._handleEvent(relativePath).catch(error => {
          this.emitError(error);
        });
      },
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

  async _handleHardlinkDirectory(relativePath: string) {
    debug(
      'Crawling hardlinked directory %s (root: %s)',
      relativePath,
      this.root,
    );
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
        this.emitError(error);
        continue;
      }
      for (const dirent of entries) {
        if (dirent.isDirectory()) {
          // We can ignore directories, to avoid triggering nested hardlink
          // handling, but also since the parent FileMap ultimately discards
          // directory events anyway
          direntQueue.push(path.join(readdirPath, dirent.name.toString()));
        } else if (dirent.isFile() || dirent.isSymbolicLink()) {
          this._handleEvent(
            path.join(readdirPath, dirent.name.toString()),
          ).catch(error => {
            this.emitError(error);
          });
        }
      }
    }
  }

  async _handleEvent(relativePath: string) {
    const absolutePath = path.resolve(this.root, relativePath);
    if (this.doIgnore(relativePath)) {
      debug('Ignoring event on %s (root: %s)', relativePath, this.root);
      return;
    }
    debug('Handling event on %s (root: %s)', relativePath, this.root);

    try {
      const stat = await fsPromises.lstat(absolutePath);
      const type = typeFromStat(stat);

      // Ignore files of an unrecognized type
      if (!type) {
        return;
      }

      if (!includedByGlob(type, this.globs, this.dot, relativePath)) {
        return;
      }

      this.emitFileEvent({
        event: TOUCH_EVENT,
        relativePath,
        metadata: {
          type,
          modifiedTime: stat.mtime.getTime(),
          size: stat.size,
        },
      });

      // If we have a hardlink on a copy-on-write file system (indicated by nlink i.e. multiple links to same inode)
      // then we should manually crawl the entire directory, since we're not expecting events for files inside it
      if (
        type === 'd' &&
        stat.nlink > 1 &&
        (await containsOnlyHardlinkedFiles(absolutePath))
      ) {
        this._handleHardlinkDirectory(relativePath).catch(error => {
          this.emitError(error);
        });
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.emitError(error);
        return;
      }

      this.emitFileEvent({event: DELETE_EVENT, relativePath});
    }
  }
}

async function containsOnlyHardlinkedFiles(
  absolutePath: string,
): Promise<boolean> {
  const entries = await fsPromises.readdir(absolutePath);
  for (const name of entries) {
    const stat = await fsPromises.lstat(path.join(absolutePath, name));
    if (stat.isFile() && stat.nlink <= 1) {
      // If any file does not have nlink > 1 then the directory isn't hardlinked
      return false;
    }
  }
  return true;
}
