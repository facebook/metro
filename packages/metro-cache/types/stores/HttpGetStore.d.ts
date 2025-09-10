/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {Options as HttpOptions} from './HttpStore';

import HttpStore from './HttpStore';

declare class HttpGetStore<T> extends HttpStore<T> {
  constructor(options: HttpOptions);
  get(key: Buffer): Promise<null | undefined | T>;
  set(_key: Buffer, _value: T): Promise<void>;
}
export default HttpGetStore;
