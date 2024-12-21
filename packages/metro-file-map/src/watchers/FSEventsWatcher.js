/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

import type {
  ChangeEventMetadata,
  WatcherBackendChangeEvent,
} from '../flow-types';
// $FlowFixMe[cannot-resolve-module] - Optional, Darwin only
// $FlowFixMe[untyped-type-import]
import type {FSEvents} from 'fsevents';

import {isIncluded, typeFromStat} from './common';
import EventEmitter from 'events';
import {promises as fsPromises} from 'fs';
import * as path from 'path';

const debug = require('debug')('Metro:FSEventsWatcher');

// $FlowFixMe[value-as-type]
let fsevents: ?FSEvents = null;
try {
  // $FlowFixMe[cannot-resolve-module] - Optional, Darwin only
  // $FlowFixMe[untyped-import]
  fsevents = require('fsevents');
} catch {
  // Optional dependency, only supported on Darwin.
}

const TOUCH_EVENT = 'touch';
const DELETE_EVENT = 'delete';
const ALL_EVENT = 'all';

/**
 * Export `FSEventsWatcher` class.
 * Watches `dir`.
 */
export default class FSEventsWatcher extends EventEmitter {
  +root: string;
  +ignored: ?RegExp;
  +glob: $ReadOnlyArray<string>;
  +dot: boolean;
  +doIgnore: (path: string) => boolean;
  +fsEventsWatchStopper: () => Promise<void>;

  static isSupported(): boolean {
    return fsevents != null;
  }

  constructor(
    dir: string,
    {
      ignored,
      glob,
      dot,
    }: $ReadOnly<{
      ignored: ?RegExp,
      glob: $ReadOnlyArray<string>,
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

    this.dot = dot || false;
    this.ignored = ignored;
    this.glob = glob;
    this.doIgnore = ignored
      ? // No need to normalise Windows paths to posix because this backend
        // only runs on macOS, and backends always emit system-native paths.
        (filePath: string) => ignored.test(filePath)
      : () => false;

    this.root = path.resolve(dir);

    this.fsEventsWatchStopper = fsevents.watch(this.root, path => {
      this._handleEvent(path).catch(error => {
        this.emit('error', error);
      });
    });

    debug(`Watching ${this.root}`);
  }

  /**
   * End watching.
   */
  async close(callback?: () => void): Promise<void> {
    await this.fsEventsWatchStopper();
    this.removeAllListeners();

    await new Promise(resolve => {
      // it takes around 100ms for fsevents to release its resources after
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

      this._emit({event: TOUCH_EVENT, relativePath, metadata});
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.emit('error', error);
        return;
      }

      this._emit({event: DELETE_EVENT, relativePath});
    }
  }

  /**
   * Emit events.
   */
  _emit(payload: Omit<WatcherBackendChangeEvent, 'root'>) {
    this.emit(ALL_EVENT, {
      ...payload,
      root: this.root,
    } as WatcherBackendChangeEvent);
  }

  getPauseReason(): ?string {
    return null;
  }
}
