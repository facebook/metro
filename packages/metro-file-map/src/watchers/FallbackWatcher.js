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

/**
 * Originally vendored from https://github.com/amasad/sane/blob/64ff3a870c42e84f744086884bf55a4f9c22d376/src/node_watcher.js
 */

import type {
  ChangeEventMetadata,
  WatcherBackendChangeEvent,
} from '../flow-types';
import type {FSWatcher, Stats} from 'fs';

import {AbstractWatcher} from './AbstractWatcher';
import * as common from './common';
import fs from 'fs';
import os from 'os';
import path from 'path';
// $FlowFixMe[untyped-import] - Write libdefs for `walker`
import walker from 'walker';

const platform = os.platform();

const fsPromises = fs.promises;

const TOUCH_EVENT = common.TOUCH_EVENT;
const DELETE_EVENT = common.DELETE_EVENT;

/**
 * This setting delays all events. It suppresses 'change' events that
 * immediately follow an 'add', and debounces successive 'change' events to
 * only emit the latest.
 */
const DEBOUNCE_MS = 100;

export default class FallbackWatcher extends AbstractWatcher {
  +_changeTimers: Map<string, TimeoutID> = new Map();
  +_dirRegistry: {
    [directory: string]: {[file: string]: true, __proto__: null},
    __proto__: null,
  } = Object.create(null);
  +watched: {[key: string]: FSWatcher, __proto__: null} = Object.create(null);

  async startWatching() {
    this._watchdir(this.root);

    await new Promise(resolve => {
      recReaddir(
        this.root,
        dir => {
          this._watchdir(dir);
        },
        filename => {
          this._register(filename, 'f');
        },
        symlink => {
          this._register(symlink, 'l');
        },
        () => {
          resolve();
        },
        this._checkedEmitError,
        this.ignored,
      );
    });
  }

  /**
   * Register files that matches our globs to know what to type of event to
   * emit in the future.
   *
   * Registry looks like the following:
   *
   *  dirRegister => Map {
   *    dirpath => Map {
   *       filename => true
   *    }
   *  }
   *
   *  Return false if ignored or already registered.
   */
  _register(filepath: string, type: ChangeEventMetadata['type']): boolean {
    const dir = path.dirname(filepath);
    const filename = path.basename(filepath);
    if (this._dirRegistry[dir] && this._dirRegistry[dir][filename]) {
      return false;
    }

    const relativePath = path.relative(this.root, filepath);
    if (
      this.doIgnore(relativePath) ||
      (type === 'f' &&
        !common.includedByGlob('f', this.globs, this.dot, relativePath))
    ) {
      return false;
    }

    if (!this._dirRegistry[dir]) {
      this._dirRegistry[dir] = Object.create(null);
    }

    this._dirRegistry[dir][filename] = true;

    return true;
  }

  /**
   * Removes a file from the registry.
   */
  _unregister(filepath: string) {
    const dir = path.dirname(filepath);
    if (this._dirRegistry[dir]) {
      const filename = path.basename(filepath);
      delete this._dirRegistry[dir][filename];
    }
  }

  /**
   * Removes a dir from the registry.
   */
  _unregisterDir(dirpath: string): void {
    if (this._dirRegistry[dirpath]) {
      delete this._dirRegistry[dirpath];
    }
  }

  /**
   * Checks if a file or directory exists in the registry.
   */
  _registered(fullpath: string): boolean {
    const dir = path.dirname(fullpath);
    return !!(
      this._dirRegistry[fullpath] ||
      (this._dirRegistry[dir] &&
        this._dirRegistry[dir][path.basename(fullpath)])
    );
  }

  /**
   * Emit "error" event if it's not an ignorable event
   */
  _checkedEmitError: (error: Error) => void = error => {
    if (!isIgnorableFileError(error)) {
      this.emitError(error);
    }
  };

  /**
   * Watch a directory.
   */
  _watchdir: string => boolean = (dir: string) => {
    if (this.watched[dir]) {
      return false;
    }
    const watcher = fs.watch(dir, {persistent: true}, (event, filename) =>
      this._normalizeChange(dir, event, filename),
    );
    this.watched[dir] = watcher;

    watcher.on('error', this._checkedEmitError);

    if (this.root !== dir) {
      this._register(dir, 'd');
    }
    return true;
  };

  /**
   * Stop watching a directory.
   */
  async _stopWatching(dir: string): Promise<void> {
    if (this.watched[dir]) {
      await new Promise(resolve => {
        this.watched[dir].once('close', () => process.nextTick(resolve));
        this.watched[dir].close();
        delete this.watched[dir];
      });
    }
  }

  /**
   * End watching.
   */
  async stopWatching(): Promise<void> {
    await super.stopWatching();
    const promises = Object.keys(this.watched).map(dir =>
      this._stopWatching(dir),
    );
    await Promise.all(promises);
  }

  /**
   * On some platforms, as pointed out on the fs docs (most likely just win32)
   * the file argument might be missing from the fs event. Try to detect what
   * change by detecting if something was deleted or the most recent file change.
   */
  _detectChangedFile(
    dir: string,
    event: string,
    callback: (file: string) => void,
  ) {
    if (!this._dirRegistry[dir]) {
      return;
    }

    let found = false;
    let closest: ?$ReadOnly<{file: string, mtime: Stats['mtime']}> = null;
    let c = 0;
    Object.keys(this._dirRegistry[dir]).forEach((file, i, arr) => {
      fs.lstat(path.join(dir, file), (error, stat) => {
        if (found) {
          return;
        }

        if (error) {
          if (isIgnorableFileError(error)) {
            found = true;
            callback(file);
          } else {
            this.emitError(error);
          }
        } else {
          if (closest == null || stat.mtime > closest.mtime) {
            closest = {file, mtime: stat.mtime};
          }
          if (arr.length === ++c) {
            callback(closest.file);
          }
        }
      });
    });
  }

  /**
   * Normalize fs events and pass it on to be processed.
   */
  _normalizeChange(dir: string, event: string, file: string) {
    if (!file) {
      this._detectChangedFile(dir, event, actualFile => {
        if (actualFile) {
          this._processChange(dir, event, actualFile).catch(error =>
            this.emitError(error),
          );
        }
      });
    } else {
      this._processChange(dir, event, path.normalize(file)).catch(error =>
        this.emitError(error),
      );
    }
  }

  /**
   * Process changes.
   */
  async _processChange(dir: string, event: string, file: string) {
    const fullPath = path.join(dir, file);
    const relativePath = path.join(path.relative(this.root, dir), file);

    const registered = this._registered(fullPath);

    try {
      const stat = await fsPromises.lstat(fullPath);
      if (stat.isDirectory()) {
        // win32 emits usless change events on dirs.
        if (event === 'change') {
          return;
        }

        if (
          this.doIgnore(relativePath) ||
          !common.includedByGlob('d', this.globs, this.dot, relativePath)
        ) {
          return;
        }
        recReaddir(
          path.resolve(this.root, relativePath),
          (dir, stats) => {
            if (this._watchdir(dir)) {
              this._emitEvent({
                event: TOUCH_EVENT,
                relativePath: path.relative(this.root, dir),
                metadata: {
                  modifiedTime: stats.mtime.getTime(),
                  size: stats.size,
                  type: 'd',
                },
              });
            }
          },
          (file, stats) => {
            if (this._register(file, 'f')) {
              this._emitEvent({
                event: TOUCH_EVENT,
                relativePath: path.relative(this.root, file),
                metadata: {
                  modifiedTime: stats.mtime.getTime(),
                  size: stats.size,
                  type: 'f',
                },
              });
            }
          },
          (symlink, stats) => {
            if (this._register(symlink, 'l')) {
              this.emitFileEvent({
                event: TOUCH_EVENT,
                relativePath: path.relative(this.root, symlink),
                metadata: {
                  modifiedTime: stats.mtime.getTime(),
                  size: stats.size,
                  type: 'l',
                },
              });
            }
          },
          function endCallback() {},
          this._checkedEmitError,
          this.ignored,
        );
      } else {
        const type = common.typeFromStat(stat);
        if (type == null) {
          return;
        }
        const metadata: ChangeEventMetadata = {
          modifiedTime: stat.mtime.getTime(),
          size: stat.size,
          type,
        };
        if (registered) {
          this._emitEvent({event: TOUCH_EVENT, relativePath, metadata});
        } else {
          if (this._register(fullPath, type)) {
            this._emitEvent({event: TOUCH_EVENT, relativePath, metadata});
          }
        }
      }
    } catch (error) {
      if (!isIgnorableFileError(error)) {
        this.emitError(error);
        return;
      }
      this._unregister(fullPath);
      this._unregisterDir(fullPath);
      if (registered) {
        this._emitEvent({event: DELETE_EVENT, relativePath});
      }
      await this._stopWatching(fullPath);
    }
  }

  /**
   * Emits the given event after debouncing, to emit only the latest
   * information when we receive several events in quick succession. E.g.,
   * Linux emits two events for every new file.
   *
   * See also note above for DEBOUNCE_MS.
   */
  _emitEvent(change: Omit<WatcherBackendChangeEvent, 'root'>) {
    const {event, relativePath} = change;
    const key = event + '-' + relativePath;
    const existingTimer = this._changeTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    this._changeTimers.set(
      key,
      setTimeout(() => {
        this._changeTimers.delete(key);
        this.emitFileEvent(change);
      }, DEBOUNCE_MS),
    );
  }

  getPauseReason(): ?string {
    return null;
  }
}
/**
 * Determine if a given FS error can be ignored
 */
function isIgnorableFileError(error: Error | {code: string}) {
  return (
    error.code === 'ENOENT' ||
    // Workaround Windows EPERM on watched folder deletion, and when
    // reading locked files (pending further writes or pending deletion).
    // In such cases, we'll receive a subsequent event when the file is
    // deleted or ready to read.
    // https://github.com/facebook/metro/issues/1001
    // https://github.com/nodejs/node-v0.x-archive/issues/4337
    (error.code === 'EPERM' && platform === 'win32')
  );
}

/**
 * Traverse a directory recursively calling `callback` on every directory.
 */
function recReaddir(
  dir: string,
  dirCallback: (string, Stats) => void,
  fileCallback: (string, Stats) => void,
  symlinkCallback: (string, Stats) => void,
  endCallback: () => void,
  errorCallback: Error => void,
  ignored: ?RegExp,
) {
  const walk = walker(dir);
  if (ignored) {
    walk.filterDir(
      (currentDir: string) =>
        !common.posixPathMatchesPattern(ignored, currentDir),
    );
  }
  walk
    .on('dir', normalizeProxy(dirCallback))
    .on('file', normalizeProxy(fileCallback))
    .on('symlink', normalizeProxy(symlinkCallback))
    .on('error', errorCallback)
    .on('end', () => {
      if (platform === 'win32') {
        setTimeout(endCallback, 1000);
      } else {
        endCallback();
      }
    });
}

/**
 * Returns a callback that when called will normalize a path and call the
 * original callback
 */
function normalizeProxy<T>(
  callback: (filepath: string, stats: Stats) => T,
): (string, Stats) => T {
  return (filepath: string, stats: Stats) =>
    callback(path.normalize(filepath), stats);
}
