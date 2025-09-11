/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

export interface CacheStore<T> {
  name?: string;
  get(key: Buffer): (null | undefined | T) | Promise<null | undefined | T>;
  set(key: Buffer, value: T): void | Promise<void>;
  clear(): void | Promise<void>;
}
