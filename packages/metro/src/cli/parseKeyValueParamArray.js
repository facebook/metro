/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import querystring from 'querystring';

export default function coerceKeyValueArray(
  keyValueArray: $ReadOnlyArray<string>,
): {
  [key: string]: string,
  __proto__: null,
} {
  const result: {[key: string]: string, __proto__: null} = Object.create(null);
  for (const item of keyValueArray) {
    if (item.indexOf('=') === -1) {
      throw new Error('Expected parameter to include "=" but found: ' + item);
    }
    if (item.indexOf('&') !== -1) {
      throw new Error('Parameter cannot include "&" but found: ' + item);
    }
    Object.assign(result, querystring.parse(item));
  }
  return result;
}
