/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<80dd2674720fe89c7a90a649a922cb1d>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-cache/src/types.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

export interface CacheStore<T> {
  name?: string;
  get(key: Buffer): (null | undefined | T) | Promise<null | undefined | T>;
  set(key: Buffer, value: T): void | Promise<void>;
  clear(): void | Promise<void>;
}
