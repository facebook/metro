/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

import type {ChangeEventMetadata} from '../flow-types';
import type {Stats} from 'fs';
// $FlowFixMe[cannot-resolve-module] - Optional, Darwin only
// $FlowFixMe[untyped-type-import]
import type {FSEvents} from 'fsevents';

import {isIncluded, typeFromStat} from './common';
// $FlowFixMe[untyped-import] - anymatch
import anymatch from 'anymatch';
import EventEmitter from 'events';
import {promises as fsPromises} from 'fs';
import * as path from 'path';
// $FlowFixMe[untyped-import] - walker
import walker from 'walker';

const debug = require('debug')('Metro:FSEventsWatcher');

type Matcher = typeof anymatch.Matcher;

// $FlowFixMe[value-as-type]
let fsevents: ?FSEvents = null;
try {
  // $FlowFixMe[cannot-resolve-module] - Optional, Darwin only
  // $FlowFixMe[untyped-import]
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
  +doIgnore: (path: string) => boolean;
  +fsEventsWatchStopper: () => Promise<void>;
  +watcherInitialReaddirPromise: Promise<void>;
  _tracked: Set<string>;

  static isSupported(): boolean {
    return fsevents != null;
  }

  static _normalizeProxy(
    callback: (normalizedPath: string, stats: Stats) => void,
  ): (filepath: string, stats: Stats) => void {
    return (filepath: string, stats: Stats): void =>
      callback(path.normalize(filepath), stats);
  }

  static _recReaddir(
    dir: string,
    dirCallback: (normalizedPath: string, stats: Stats) => void,
    fileCallback: (normalizedPath: string, stats: Stats) => void,
    symlinkCallback: (normalizedPath: string, stats: Stats) => void,
    endCallback: () => void,
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
      .on('symlink', FSEventsWatcher._normalizeProxy(symlinkCallback))
      .on('error', errorCallback)
      .on('end', endCallback);
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
    this.doIgnore = opts.ignored ? anymatch(opts.ignored) : () => false;

    this.root = path.resolve(dir);

    this.fsEventsWatchStopper = fsevents.watch(this.root, path => {
      this._handleEvent(path).catch(error => {
        this.emit('error', error);
      });
    });

    debug(`Watching ${this.root}`);

    this._tracked = new Set();
    const trackPath = (filePath: string) => {
      this._tracked.add(filePath);
    };
    this.watcherInitialReaddirPromise = new Promise(resolve => {
      FSEventsWatcher._recReaddir(
        this.root,
        trackPath,
        trackPath,
        trackPath,
        () => {
          this.emit('ready');
          resolve();
        },
        (...args) => {
          this.emit('error', ...args);
          resolve();
        },
        this.ignored,
      );
    });
  }

  /**
   * End watching.
   */
  async close(callback?: () => void): Promise<void> {
    await this.watcherInitialReaddirPromise;
    await this.fsEventsWatchStopper();
    this.removeAllListeners();

    await new Promise(resolve => {
      // it takes around 100ms for fsevents to release its resounces after
      // watching is stopped. See __tests__/server-torn-down-test.js
      setTimeout(() => {
        if (typeof callback === 'function') {
          callback();
        }
        resolve();
      }, 100);
    });
  }

  async _handleEvent(filepath: string) {
    const relativePath = path.relative(this.root, filepath);

    try {
      const stat = await fsPromises.lstat(filepath);
      const type = typeFromStat(stat);

      // Ignore files of an unrecognized type
      if (!type) {
        return;
      }

      if (!isIncluded(type, this.glob, this.dot, this.doIgnore, relativePath)) {
        return;
      }

      const metadata: ChangeEventMetadata = {
        type,
        modifiedTime: stat.mtime.getTime(),
        size: stat.size,
      };

      if (this._tracked.has(filepath)) {
        this._emit(CHANGE_EVENT, relativePath, metadata);
      } else {
        this._tracked.add(filepath);
        this._emit(ADD_EVENT, relativePath, metadata);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.emit('error', error);
        return;
      }

      // Ignore files that aren't tracked and don't exist.
      if (!this._tracked.has(filepath)) {
        return;
      }

      this._emit(DELETE_EVENT, relativePath);
      this._tracked.delete(filepath);
    }
  }

  /**
   * Emit events.
   */
  _emit(
    type: FsEventsWatcherEvent,
    file: string,
    metadata?: ChangeEventMetadata,
  ) {
    this.emit(type, file, this.root, metadata);
    this.emit(ALL_EVENT, type, file, this.root, metadata);
  }

  getPauseReason(): ?string {
    return null;
  }
}
