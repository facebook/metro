/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<1fe6ca4aa9f1f410281edf1b8f9adea2>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-cache/src/Cache.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {CacheStore} from './types';
/**
 * Main cache class. Receives an array of cache instances, and sequentially
 * traverses them to return a previously stored value. It also ensures setting
 * the value in all instances.
 *
 * All get/set operations are logged via Metro's logger.
 */
declare class Cache<T> {
  constructor(stores: ReadonlyArray<CacheStore<T>>);
  get(key: Buffer): Promise<null | undefined | T>;
  set(key: Buffer, value: T): Promise<void>;
  get isDisabled(): boolean;
}
export default Cache;
