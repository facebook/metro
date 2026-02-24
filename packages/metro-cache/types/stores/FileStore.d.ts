/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<7de501c6653d300c594fcf37ce3b56f4>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-cache/src/stores/FileStore.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

export type Options = Readonly<{root: string}>;
declare class FileStore<T> {
  constructor(options: Options);
  get(key: Buffer): Promise<null | undefined | T>;
  set(key: Buffer, value: T): Promise<void>;
  clear(): void;
}
export default FileStore;
