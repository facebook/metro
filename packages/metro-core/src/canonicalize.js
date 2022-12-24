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

'use strict';

function canonicalize(key: string, value: mixed): mixed {
  if (
    // eslint-disable-next-line lint/strictly-null
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return value;
  }

  const keys = Object.keys(value).sort();
  const length = keys.length;
  const object: {[string]: mixed} = {};

  for (let i = 0; i < length; i++) {
    object[keys[i]] = value[keys[i]];
  }

  return object;
}

module.exports = canonicalize;
