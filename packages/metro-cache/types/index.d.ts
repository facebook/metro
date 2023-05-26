/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

// <reference types="node" />

import AutoCleanFileStore from './stores/AutoCleanFileStore';
import FileStore from './stores/FileStore';
import HttpGetStore from './stores/HttpGetStore';
import HttpStore from './stores/HttpStore';
import Cache from './Cache';
import stableHash from './stableHash';

export type {Options as FileOptions} from './stores/FileStore';
export type {Options as HttpOptions} from './stores/HttpStore';
export type {CacheStore} from './types';

export interface MetroCache {
  AutoCleanFileStore: typeof AutoCleanFileStore;
  Cache: typeof Cache;
  FileStore: typeof FileStore;
  HttpGetStore: typeof HttpGetStore;
  HttpStore: typeof HttpStore;
  stableHash: typeof stableHash;
}

export {
  AutoCleanFileStore,
  Cache,
  FileStore,
  HttpGetStore,
  HttpStore,
  stableHash,
};
