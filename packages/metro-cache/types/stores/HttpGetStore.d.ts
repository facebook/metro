/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<12106d5e641e2402d71f229ec168a8ec>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-cache/src/stores/HttpGetStore.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Options as HttpOptions} from './HttpStore';

import HttpStore from './HttpStore';

declare class HttpGetStore<T> extends HttpStore<T> {
  constructor(options: HttpOptions);
  get(key: Buffer): Promise<null | undefined | T>;
  set(_key: Buffer, _value: T): Promise<void>;
}
export default HttpGetStore;
