/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<2bb72546f80164eb8c0068f9de3a1487>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-cache/src/index.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import Cache from './Cache';
import stableHash from './stableHash';
import AutoCleanFileStore from './stores/AutoCleanFileStore';
import FileStore from './stores/FileStore';
import HttpGetStore from './stores/HttpGetStore';
import HttpStore from './stores/HttpStore';

export type {Options as FileOptions} from './stores/FileStore';
export type {Options as HttpOptions} from './stores/HttpStore';
export type {CacheStore} from './types';
export {
  AutoCleanFileStore,
  Cache,
  FileStore,
  HttpGetStore,
  HttpStore,
  stableHash,
};
export interface MetroCache {
  readonly AutoCleanFileStore: typeof AutoCleanFileStore;
  readonly Cache: typeof Cache;
  readonly FileStore: typeof FileStore;
  readonly HttpGetStore: typeof HttpGetStore;
  readonly HttpStore: typeof HttpStore;
  readonly stableHash: typeof stableHash;
}
/**
 * Backwards-compatibility with CommonJS consumers using interopRequireDefault.
 * Do not add to this list.
 *
 * @deprecated Default import from 'metro-cache' is deprecated, use named exports.
 */
declare const $$EXPORT_DEFAULT_DECLARATION$$: MetroCache;
declare type $$EXPORT_DEFAULT_DECLARATION$$ =
  typeof $$EXPORT_DEFAULT_DECLARATION$$;
export default $$EXPORT_DEFAULT_DECLARATION$$;
