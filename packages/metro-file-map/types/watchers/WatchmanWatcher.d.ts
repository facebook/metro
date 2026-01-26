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

import {AbstractWatcher} from './AbstractWatcher';
/**
 * Watches `dir`.
 */
declare class WatchmanWatcher extends AbstractWatcher {
  readonly subscriptionName: string;
  constructor(dir: string, opts: WatcherOptions);
  startWatching(): Promise<void>;
  /**
   * Closes the watcher.
   */
  stopWatching(): Promise<void>;
  getPauseReason(): null | undefined | string;
}
export default WatchmanWatcher;
