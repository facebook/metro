/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {Options} from './HttpStore';

export default class HttpGetStore<T> {
  constructor(options: Options);
  get(key: Buffer): Promise<T | null>;
  set(key: Buffer, value: T): Promise<void>;
  clear(): void;
}
