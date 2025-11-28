/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {WatcherOptions} from './common';
import type {
  Client,
  WatchmanFileChange,
  WatchmanSubscriptionEvent,
} from 'fb-watchman';

import {AbstractWatcher} from './AbstractWatcher';
/**
 * Watches `dir`.
 */
declare class WatchmanWatcher extends AbstractWatcher {
  client: Client;
  readonly subscriptionName: string;
  watchProjectInfo:
    | null
    | undefined
    | Readonly<{relativePath: string; root: string}>;
  readonly watchmanDeferStates: ReadonlyArray<string>;
  constructor(dir: string, opts: WatcherOptions);
  startWatching(): Promise<void>;
  /**
   * Run the watchman `watch` command on the root and subscribe to changes.
   */
  _init(onReady: () => void, onError: (error: Error) => void): void;
  /**
   * Handles a change event coming from the subscription.
   */
  _handleChangeEvent(resp: WatchmanSubscriptionEvent): void;
  /**
   * Handles a single change event record.
   */
  _handleFileChange(
    changeDescriptor: WatchmanFileChange,
    rawClock: WatchmanSubscriptionEvent['clock'],
  ): void;
  /**
   * Closes the watcher.
   */
  stopWatching(): Promise<void>;
  getPauseReason(): null | undefined | string;
}
export default WatchmanWatcher;
