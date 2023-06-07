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

import type {WatcherOptions} from './common';
import type {ChangeEventMetadata} from '../flow-types';
import type {
  Client,
  WatchmanClockResponse,
  WatchmanFileChange,
  WatchmanQuery,
  WatchmanSubscriptionEvent,
  WatchmanSubscribeResponse,
  WatchmanWatchResponse,
} from 'fb-watchman';

import * as common from './common';
import RecrawlWarning from './RecrawlWarning';
import assert from 'assert';
import {createHash} from 'crypto';
import EventEmitter from 'events';
import watchman from 'fb-watchman';
import invariant from 'invariant';
import path from 'path';

const debug = require('debug')('Metro:WatchmanWatcher');

const CHANGE_EVENT = common.CHANGE_EVENT;
const DELETE_EVENT = common.DELETE_EVENT;
const ADD_EVENT = common.ADD_EVENT;
const ALL_EVENT = common.ALL_EVENT;
const SUB_PREFIX = 'metro-file-map';

/**
 * Watches `dir`.
 */
export default class WatchmanWatcher extends EventEmitter {
  client: Client;
  dot: boolean;
  doIgnore: string => boolean;
  globs: $ReadOnlyArray<string>;
  root: string;
  subscriptionName: string;
  watchProjectInfo: ?$ReadOnly<{
    relativePath: string,
    root: string,
  }>;
  watchmanDeferStates: $ReadOnlyArray<string>;
  #deferringStates: Set<string> = new Set();

  constructor(dir: string, opts: WatcherOptions) {
    super();

    common.assignOptions(this, opts);
    this.root = path.resolve(dir);

    // Use a unique subscription name per process per watched directory
    const watchKey = createHash('md5').update(this.root).digest('hex');
    const readablePath = this.root
      .replace(/[\/\\]/g, '-') // \ and / to -
      .replace(/[^\-\w]/g, ''); // Remove non-word/hyphen
    this.subscriptionName = `${SUB_PREFIX}-${process.pid}-${readablePath}-${watchKey}`;

    this._init();
  }

  /**
   * Run the watchman `watch` command on the root and subscribe to changes.
   */
  _init() {
    if (this.client) {
      this.client.removeAllListeners();
    }

    const self = this;
    this.client = new watchman.Client();
    this.client.on('error', error => {
      self.emit('error', error);
    });
    this.client.on('subscription', changeEvent =>
      this._handleChangeEvent(changeEvent),
    );
    this.client.on('end', () => {
      console.warn(
        '[metro-file-map] Warning: Lost connection to Watchman, reconnecting..',
      );
      self._init();
    });

    this.watchProjectInfo = null;

    function getWatchRoot() {
      return self.watchProjectInfo ? self.watchProjectInfo.root : self.root;
    }

    function onWatchProject(error: ?Error, resp: WatchmanWatchResponse) {
      if (handleError(self, error)) {
        return;
      }
      debug('Received watch-project response: %s', resp.relative_path);

      handleWarning(resp);

      self.watchProjectInfo = {
        relativePath: resp.relative_path ? resp.relative_path : '',
        root: resp.watch,
      };

      self.client.command(['clock', getWatchRoot()], onClock);
    }

    function onClock(error: ?Error, resp: WatchmanClockResponse) {
      if (handleError(self, error)) {
        return;
      }

      debug('Received clock response: %s', resp.clock);
      const watchProjectInfo = self.watchProjectInfo;

      invariant(
        watchProjectInfo != null,
        'watch-project response should have been set before clock response',
      );

      handleWarning(resp);

      const options: WatchmanQuery = {
        fields: ['name', 'exists', 'new', 'type', 'size', 'mtime_ms'],
        since: resp.clock,
        defer: self.watchmanDeferStates,
        relative_root: watchProjectInfo.relativePath,
      };

      // Make sure we honor the dot option if even we're not using globs.
      if (self.globs.length === 0 && !self.dot) {
        options.expression = [
          'match',
          '**',
          'wholename',
          {
            includedotfiles: false,
          },
        ];
      }

      self.client.command(
        ['subscribe', getWatchRoot(), self.subscriptionName, options],
        onSubscribe,
      );
    }

    const onSubscribe = (error: ?Error, resp: WatchmanSubscribeResponse) => {
      if (handleError(self, error)) {
        return;
      }
      debug('Received subscribe response: %s', resp.subscribe);

      handleWarning(resp);

      for (const state of resp['asserted-states']) {
        this.#deferringStates.add(state);
      }

      self.emit('ready');
    };

    self.client.command(['watch-project', getWatchRoot()], onWatchProject);
  }

  /**
   * Handles a change event coming from the subscription.
   */
  _handleChangeEvent(resp: WatchmanSubscriptionEvent) {
    debug(
      'Received subscription response: %s (fresh: %s, files: %s, enter: %s, leave: %s)',
      resp.subscription,
      resp.is_fresh_instance,
      resp.files?.length,
      resp['state-enter'],
      resp['state-leave'],
    );

    assert.equal(
      resp.subscription,
      this.subscriptionName,
      'Invalid subscription event.',
    );

    if (resp.is_fresh_instance) {
      this.emit('fresh_instance');
    }
    if (resp.is_fresh_instance) {
      this.emit('fresh_instance');
    }
    if (Array.isArray(resp.files)) {
      resp.files.forEach(change => this._handleFileChange(change));
    }
    const {'state-enter': stateEnter, 'state-leave': stateLeave} = resp;
    if (
      stateEnter != null &&
      (this.watchmanDeferStates ?? []).includes(stateEnter)
    ) {
      this.#deferringStates.add(stateEnter);
      debug(
        'Watchman reports "%s" just started. Filesystem notifications are paused.',
        stateEnter,
      );
    }
    if (
      stateLeave != null &&
      (this.watchmanDeferStates ?? []).includes(stateLeave)
    ) {
      this.#deferringStates.delete(stateLeave);
      debug(
        'Watchman reports "%s" ended. Filesystem notifications resumed.',
        stateLeave,
      );
    }
  }

  /**
   * Handles a single change event record.
   */
  _handleFileChange(changeDescriptor: WatchmanFileChange) {
    const self = this;
    const watchProjectInfo = self.watchProjectInfo;

    invariant(
      watchProjectInfo != null,
      'watch-project response should have been set before receiving subscription events',
    );

    const {
      name: relativePath,
      new: isNew = false,
      exists = false,
      type,
      mtime_ms,
      size,
    } = changeDescriptor;

    debug(
      'Handling change to: %s (new: %s, exists: %s, type: %s)',
      relativePath,
      isNew,
      exists,
      type,
    );

    // Ignore files of an unrecognized type
    if (type != null && !(type === 'f' || type === 'd' || type === 'l')) {
      return;
    }

    if (
      !common.isIncluded(
        type,
        this.globs,
        this.dot,
        this.doIgnore,
        relativePath,
      )
    ) {
      return;
    }

    if (!exists) {
      self._emitEvent(DELETE_EVENT, relativePath, self.root);
    } else {
      const eventType = isNew ? ADD_EVENT : CHANGE_EVENT;
      invariant(
        type != null && mtime_ms != null && size != null,
        'Watchman file change event for "%s" missing some requested metadata. ' +
          'Got type: %s, mtime_ms: %s, size: %s',
        relativePath,
        type,
        mtime_ms,
        size,
      );

      if (
        // Change event on dirs are mostly useless.
        !(type === 'd' && eventType === CHANGE_EVENT)
      ) {
        const mtime = Number(mtime_ms);
        self._emitEvent(eventType, relativePath, self.root, {
          modifiedTime: mtime !== 0 ? mtime : null,
          size,
          type,
        });
      }
    }
  }

  /**
   * Dispatches the event.
   */
  _emitEvent(
    eventType: string,
    filepath: string,
    root: string,
    changeMetadata?: ChangeEventMetadata,
  ) {
    this.emit(eventType, filepath, root, changeMetadata);
    this.emit(ALL_EVENT, eventType, filepath, root, changeMetadata);
  }

  /**
   * Closes the watcher.
   */
  async close() {
    this.client.removeAllListeners();
    this.client.end();
    this.#deferringStates.clear();
  }

  getPauseReason(): ?string {
    if (this.#deferringStates.size) {
      const states = [...this.#deferringStates];
      if (states.length === 1) {
        return `The watch is in the '${states[0]}' state.`;
      }
      return `The watch is in the ${states
        .slice(0, -1)
        .map(s => `'${s}'`)
        .join(', ')} and '${states[states.length - 1]}' states.`;
    }
    return null;
  }
}

/**
 * Handles an error and returns true if exists.
 */
function handleError(emitter: EventEmitter, error: ?Error) {
  if (error != null) {
    emitter.emit('error', error);
    return true;
  } else {
    return false;
  }
}

/**
 * Handles a warning in the watchman resp object.
 */
function handleWarning(resp: $ReadOnly<{warning?: mixed, ...}>) {
  if ('warning' in resp) {
    if (RecrawlWarning.isRecrawlWarningDupe(resp.warning)) {
      return true;
    }
    console.warn(resp.warning);
    return true;
  } else {
    return false;
  }
}
