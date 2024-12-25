/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

// $FlowFixMe[cannot-resolve-module] - Optional, Darwin only
// $FlowFixMe[untyped-type-import]
import type {FSEvents} from 'fsevents';

import {AbstractWatcher} from './AbstractWatcher';
import {includedByGlob, typeFromStat} from './common';
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

/**
 * Export `FSEventsWatcher` class.
 * Watches `dir`.
 */
export default class FSEventsWatcher extends AbstractWatcher {
  +#fsevents: FSEvents;
  #fsEventsWatchStopper: () => Promise<void>;

  static isSupported(): boolean {
    return fsevents != null;
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
    if (!fsevents) {
      throw new Error(
        '`fsevents` unavailable (this watcher can only be used on Darwin)',
      );
    }
    super(dir, opts);
    this.#fsevents = fsevents;
  }

  async startWatching(): Promise<void> {
    this.#fsEventsWatchStopper = this.#fsevents.watch(this.root, path => {
      this._handleEvent(path).catch(error => {
        this.emitError(error);
      });
    });

    debug('Watching %s', this.root);
  }

  /**
   * End watching.
   */
  async stopWatching(): Promise<void> {
    await super.stopWatching();
    await this.#fsEventsWatchStopper();

    await new Promise(resolve => {
      // it takes around 100ms for fsevents to release its resources after
      // watching is stopped. See __tests__/server-torn-down-test.js
      setTimeout(() => resolve(), 100);
    });
  }

  async _handleEvent(filepath: string) {
    const relativePath = path.relative(this.root, filepath);
    if (this.doIgnore(relativePath)) {
      debug('Ignoring event on %s (root: %s)', relativePath, this.root);
      return;
    }
    debug('Handling event on %s (root: %s)', relativePath, this.root);

    try {
      const stat = await fsPromises.lstat(filepath);
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
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.emitError(error);
        return;
      }

      this.emitFileEvent({event: DELETE_EVENT, relativePath});
    }
  }
}
