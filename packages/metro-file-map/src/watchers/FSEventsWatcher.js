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
// $FlowFixMe[cannot-resolve-module] - Optional, Darwin only
// $FlowFixMe[untyped-type-import]
import type {FSEvents} from 'fsevents';

import {
  isIncluded,
  posixPathMatchesPattern,
  recReaddir,
  typeFromStat,
} from './common';
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

const CHANGE_EVENT = 'change';
const DELETE_EVENT = 'delete';
const ADD_EVENT = 'add';
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
  +watcherInitialReaddirPromise: Promise<void>;
  _tracked: Set<string>;

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

    this.dot = dot || false;
    this.ignored = ignored;
    this.glob = Array.isArray(glob) ? glob : [glob];
    this.doIgnore = ignored
      ? (filePath: string) => posixPathMatchesPattern(ignored, filePath)
      : () => false;

    this.root = path.resolve(dir);

    this.fsEventsWatchStopper = fsevents.watch(this.root, path => {
      this._handleEvent(path).catch(error => {
        this.emit('error', error);
      });
    });

    debug(`Watching ${this.root}`);

    this._tracked = new Set();
    const trackPath = (filePath: string) => {
      this._tracked.add(path.normalize(filePath));
    };
    this.watcherInitialReaddirPromise = new Promise(resolve => {
      recReaddir(
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
        this._emit({event: CHANGE_EVENT, relativePath, metadata});
      } else {
        this._tracked.add(filepath);
        this._emit({event: ADD_EVENT, relativePath, metadata});
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

      this._emit({event: DELETE_EVENT, relativePath});
      this._tracked.delete(filepath);
    }
  }

  /**
   * Emit events.
   */
  _emit({
    event,
    relativePath,
    metadata,
  }:
    | {
        event: 'change' | 'add',
        relativePath: string,
        metadata: ChangeEventMetadata,
      }
    | {
        event: 'delete',
        relativePath: string,
        metadata?: void,
      }) {
    this.emit(event, relativePath, this.root, metadata);
    this.emit(ALL_EVENT, event, relativePath, this.root, metadata);
  }

  getPauseReason(): ?string {
    return null;
  }
}
