/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<05ef02cd1f35e98055791237d573dc5a>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-cache/src/stores/HttpStore.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import HttpError from './HttpError';
import NetworkError from './NetworkError';

export type Options =
  | EndpointOptions
  | {getOptions: EndpointOptions; setOptions: EndpointOptions};
type EndpointOptions = {
  endpoint: string;
  family?: 4 | 6;
  timeout?: number;
  key?: string | ReadonlyArray<string> | Buffer | ReadonlyArray<Buffer>;
  cert?: string | ReadonlyArray<string> | Buffer | ReadonlyArray<Buffer>;
  ca?: string | ReadonlyArray<string> | Buffer | ReadonlyArray<Buffer>;
  params?: URLSearchParams;
  headers?: {[$$Key$$: string]: string};
  additionalSuccessStatuses?: ReadonlyArray<number>;
  /**
   * Whether to include additional debug information in error messages.
   */
  debug?: boolean;
  /**
   * Retry configuration
   */
  maxAttempts?: number;
  retryNetworkErrors?: boolean;
  retryStatuses?: ReadonlySet<number>;
  socketPath?: string;
  proxy?: string;
};
declare class HttpStore<T> {
  static HttpError: typeof HttpError;
  static NetworkError: typeof NetworkError;
  constructor(options: Options);
  get(key: Buffer): Promise<null | undefined | T>;
  set(key: Buffer, value: T): Promise<void>;
  clear(): void;
}
export default HttpStore;
