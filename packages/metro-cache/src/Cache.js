/**
 * Copyright (c) 2018-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

import type {CacheStore} from 'metro-cache';

class Cache<T> {
  _stores: $ReadOnlyArray<CacheStore<T>>;

  constructor(stores: $ReadOnlyArray<CacheStore<T>>) {
    this._stores = stores;
  }

  async get(key: Buffer): Promise<?T> {
    const stores = this._stores;
    const length = stores.length;

    for (let i = 0; i < length; i++) {
      let value = stores[i].get(key);

      if (value instanceof Promise) {
        value = await value;
      }

      if (value != null) {
        return value;
      }
    }

    return null;
  }

  set(key: Buffer, value: T): void {
    Promise.all(this._stores.map(store => store.set(key, value))).catch(err => {
      process.nextTick(() => {
        throw err;
      });
    });
  }
}

module.exports = Cache;
