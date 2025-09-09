/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
