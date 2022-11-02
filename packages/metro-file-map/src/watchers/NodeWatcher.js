/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

/**
 * Originally vendored from https://github.com/amasad/sane/blob/64ff3a870c42e84f744086884bf55a4f9c22d376/src/node_watcher.js
 */

'use strict';

import type {WatcherOptions} from './common';
import type {FSWatcher, Stats} from 'fs';

const common = require('./common');
const {EventEmitter} = require('events');
const fs = require('fs');
const platform = require('os').platform();
const path = require('path');

const DEFAULT_DELAY = common.DEFAULT_DELAY;
const CHANGE_EVENT = common.CHANGE_EVENT;
const DELETE_EVENT = common.DELETE_EVENT;
const ADD_EVENT = common.ADD_EVENT;
const ALL_EVENT = common.ALL_EVENT;

module.exports = class NodeWatcher extends EventEmitter {
  _changeTimers: {[key: string]: TimeoutID, __proto__: null};
  _dirRegistry: {
    [directory: string]: {[file: string]: true, __proto__: null},
    __proto__: null,
  };
  doIgnore: string => boolean;
  dot: boolean;
  globs: $ReadOnlyArray<string>;
  hasIgnore: boolean;
  ignored: ?(boolean | RegExp);
  root: string;
  watched: {[key: string]: FSWatcher, __proto__: null};
  watchmanDeferStates: $ReadOnlyArray<string>;

  constructor(dir: string, opts: WatcherOptions) {
    super();

    common.assignOptions(this, opts);

    this.watched = Object.create(null);
    this._changeTimers = Object.create(null);
    this._dirRegistry = Object.create(null);
    this.root = path.resolve(dir);

    this._watchdir(this.root);
    common.recReaddir(
      this.root,
      this._watchdir,
      filename => {
        this._register(filename);
      },
      () => {
        this.emit('ready');
      },
      this._checkedEmitError,
      this.ignored,
    );
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
   */
  _register(filepath: string): boolean {
    const relativePath = path.relative(this.root, filepath);
    if (
      !common.isFileIncluded(this.globs, this.dot, this.doIgnore, relativePath)
    ) {
      return false;
    }

    const dir = path.dirname(filepath);
    if (!this._dirRegistry[dir]) {
      this._dirRegistry[dir] = Object.create(null);
    }

    const filename = path.basename(filepath);
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
      this.emit('error', error);
    }
  };

  /**
   * Watch a directory.
   */
  _watchdir: string => void = (dir: string) => {
    if (this.watched[dir]) {
      return;
    }

    const watcher = fs.watch(dir, {persistent: true}, (event, filename) =>
      this._normalizeChange(dir, event, filename),
    );
    this.watched[dir] = watcher;

    watcher.on('error', this._checkedEmitError);

    if (this.root !== dir) {
      this._register(dir);
    }
  };

  /**
   * Stop watching a directory.
   */
  _stopWatching(dir: string) {
    if (this.watched[dir]) {
      this.watched[dir].close();
      delete this.watched[dir];
    }
  }

  /**
   * End watching.
   */
  async close(): Promise<void> {
    Object.keys(this.watched).forEach(dir => this._stopWatching(dir));
    this.removeAllListeners();
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
            this.emit('error', error);
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
          this._processChange(dir, event, actualFile);
        }
      });
    } else {
      this._processChange(dir, event, path.normalize(file));
    }
  }

  /**
   * Process changes.
   */
  _processChange(dir: string, event: string, file: string) {
    const fullPath = path.join(dir, file);
    const relativePath = path.join(path.relative(this.root, dir), file);

    fs.lstat(fullPath, (error, stat) => {
      if (error && error.code !== 'ENOENT') {
        this.emit('error', error);
      } else if (!error && stat.isDirectory()) {
        // win32 emits usless change events on dirs.
        if (event !== 'change') {
          this._watchdir(fullPath);
          if (
            common.isFileIncluded(
              this.globs,
              this.dot,
              this.doIgnore,
              relativePath,
            )
          ) {
            this._emitEvent(ADD_EVENT, relativePath, stat);
          }
        }
      } else {
        const registered = this._registered(fullPath);
        if (error && error.code === 'ENOENT') {
          this._unregister(fullPath);
          this._stopWatching(fullPath);
          this._unregisterDir(fullPath);
          if (registered) {
            this._emitEvent(DELETE_EVENT, relativePath);
          }
        } else if (registered) {
          this._emitEvent(CHANGE_EVENT, relativePath, stat);
        } else {
          if (this._register(fullPath)) {
            this._emitEvent(ADD_EVENT, relativePath, stat);
          }
        }
      }
    });
  }

  /**
   * Triggers a 'change' event after debounding it to take care of duplicate
   * events on os x.
   */
  _emitEvent(type: string, file: string, stat?: Stats) {
    const key = type + '-' + file;
    const addKey = ADD_EVENT + '-' + file;
    if (type === CHANGE_EVENT && this._changeTimers[addKey]) {
      // Ignore the change event that is immediately fired after an add event.
      // (This happens on Linux).
      return;
    }
    clearTimeout(this._changeTimers[key]);
    this._changeTimers[key] = setTimeout(() => {
      delete this._changeTimers[key];
      if (type === ADD_EVENT && stat?.isDirectory()) {
        // Recursively emit add events and watch for sub-files/folders
        common.recReaddir(
          path.resolve(this.root, file),
          (dir, stats) => {
            this._watchdir(dir);
            this._rawEmitEvent(ADD_EVENT, path.relative(this.root, dir), stats);
          },
          (file, stats) => {
            this._register(file);
            this._rawEmitEvent(
              ADD_EVENT,
              path.relative(this.root, file),
              stats,
            );
          },
          function endCallback() {},
          this._checkedEmitError,
          this.ignored,
        );
      } else {
        this._rawEmitEvent(type, file, stat);
      }
    }, DEFAULT_DELAY);
  }

  /**
   * Actually emit the events
   */
  _rawEmitEvent(type: string, file: string, stat: ?Stats) {
    this.emit(type, file, this.root, stat);
    this.emit(ALL_EVENT, type, file, this.root, stat);
  }

  getPauseReason(): ?string {
    return null;
  }
};
/**
 * Determine if a given FS error can be ignored
 */
function isIgnorableFileError(error: Error | {code: string}) {
  return (
    error.code === 'ENOENT' ||
    // Workaround Windows node issue #4337.
    (error.code === 'EPERM' && platform === 'win32')
  );
}
