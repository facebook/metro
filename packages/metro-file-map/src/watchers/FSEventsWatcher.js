/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

// $FlowFixMe[untyped-import] - anymatch
import anymatch from 'anymatch';
import EventEmitter from 'events';
import * as fs from 'graceful-fs';
import * as path from 'path';
// $FlowFixMe[untyped-import] - walker
import walker from 'walker';

// $FlowFixMe[untyped-import] - micromatch
const micromatch = require('micromatch');

type Matcher = typeof anymatch.Matcher;

// $FlowFixMe[unclear-type] - fsevents
let fsevents: any = null;
try {
  // $FlowFixMe[cannot-resolve-module] - Optional, Darwin only
  fsevents = require('fsevents');
} catch {
  // Optional dependency, only supported on Darwin.
}

const CHANGE_EVENT = 'change';
const DELETE_EVENT = 'delete';
const ADD_EVENT = 'add';
const ALL_EVENT = 'all';

type FsEventsWatcherEvent =
  | typeof CHANGE_EVENT
  | typeof DELETE_EVENT
  | typeof ADD_EVENT
  | typeof ALL_EVENT;

/**
 * Export `FSEventsWatcher` class.
 * Watches `dir`.
 */
export default class FSEventsWatcher extends EventEmitter {
  +root: string;
  +ignored: ?Matcher;
  +glob: $ReadOnlyArray<string>;
  +dot: boolean;
  +hasIgnore: boolean;
  +doIgnore: (path: string) => boolean;
  +fsEventsWatchStopper: () => Promise<void>;
  _tracked: Set<string>;

  static isSupported(): boolean {
    return fsevents != null;
  }

  static _normalizeProxy(
    callback: (normalizedPath: string, stats: fs.Stats) => void,
  ) {
    return (filepath: string, stats: fs.Stats): void =>
      callback(path.normalize(filepath), stats);
  }

  static _recReaddir(
    dir: string,
    dirCallback: (normalizedPath: string, stats: fs.Stats) => void,
    fileCallback: (normalizedPath: string, stats: fs.Stats) => void,
    // $FlowFixMe[unclear-type] Add types for callback
    endCallback: Function,
    // $FlowFixMe[unclear-type] Add types for callback
    errorCallback: Function,
    ignored?: Matcher,
  ) {
    walker(dir)
      .filterDir(
        (currentDir: string) => !ignored || !anymatch(ignored, currentDir),
      )
      .on('dir', FSEventsWatcher._normalizeProxy(dirCallback))
      .on('file', FSEventsWatcher._normalizeProxy(fileCallback))
      .on('error', errorCallback)
      .on('end', () => {
        endCallback();
      });
  }

  constructor(
    dir: string,
    opts: $ReadOnly<{
      ignored?: Matcher,
      glob: string | $ReadOnlyArray<string>,
      dot: boolean,
      ...
    }>,
  ) {
    if (!fsevents) {
      throw new Error(
        '`fsevents` unavailable (this watcher can only be used on Darwin)',
      );
    }

    super();

    this.dot = opts.dot || false;
    this.ignored = opts.ignored;
    this.glob = Array.isArray(opts.glob) ? opts.glob : [opts.glob];

    this.hasIgnore =
      Boolean(opts.ignored) && !(Array.isArray(opts) && opts.length > 0);
    this.doIgnore = opts.ignored ? anymatch(opts.ignored) : () => false;

    this.root = path.resolve(dir);
    this.fsEventsWatchStopper = fsevents.watch(
      this.root,
      // $FlowFixMe[method-unbinding] - Refactor
      this._handleEvent.bind(this),
    );

    this._tracked = new Set();
    FSEventsWatcher._recReaddir(
      this.root,
      (filepath: string) => {
        this._tracked.add(filepath);
      },
      (filepath: string) => {
        this._tracked.add(filepath);
      },
      // $FlowFixMe[method-unbinding] - Refactor
      this.emit.bind(this, 'ready'),
      // $FlowFixMe[method-unbinding] - Refactor
      this.emit.bind(this, 'error'),
      this.ignored,
    );
  }

  /**
   * End watching.
   */
  async close(callback?: () => void): Promise<void> {
    await this.fsEventsWatchStopper();
    this.removeAllListeners();
    if (typeof callback === 'function') {
      // $FlowFixMe[extra-arg] - Is this a Node-style callback or as typed?
      process.nextTick(callback.bind(null, null, true));
    }
  }

  _isFileIncluded(relativePath: string) {
    if (this.doIgnore(relativePath)) {
      return false;
    }
    return this.glob.length
      ? micromatch([relativePath], this.glob, {dot: this.dot}).length > 0
      : this.dot || micromatch([relativePath], '**/*').length > 0;
  }

  _handleEvent(filepath: string) {
    const relativePath = path.relative(this.root, filepath);
    if (!this._isFileIncluded(relativePath)) {
      return;
    }

    fs.lstat(filepath, (error, stat) => {
      if (error && error.code !== 'ENOENT') {
        this.emit('error', error);
        return;
      }

      if (error) {
        // Ignore files that aren't tracked and don't exist.
        if (!this._tracked.has(filepath)) {
          return;
        }

        this._emit(DELETE_EVENT, relativePath);
        this._tracked.delete(filepath);
        return;
      }

      if (this._tracked.has(filepath)) {
        this._emit(CHANGE_EVENT, relativePath, stat);
      } else {
        this._tracked.add(filepath);
        this._emit(ADD_EVENT, relativePath, stat);
      }
    });
  }

  /**
   * Emit events.
   */
  _emit(type: FsEventsWatcherEvent, file: string, stat?: fs.Stats) {
    this.emit(type, file, this.root, stat);
    this.emit(ALL_EVENT, type, file, this.root, stat);
  }
}
