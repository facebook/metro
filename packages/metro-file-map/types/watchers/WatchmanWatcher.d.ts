/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<b8358b8822835bcef505207f90b02c66>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/watchers/WatchmanWatcher.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
