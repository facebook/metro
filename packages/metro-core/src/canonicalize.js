/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

function canonicalize(key: string, value: mixed): mixed {
  if (!(value instanceof Object) || value instanceof Array) {
    return value;
  }

  const keys = Object.keys(value).sort();
  const length = keys.length;
  const object = {};

  for (let i = 0; i < length; i++) {
    object[keys[i]] = value[keys[i]];
  }

  return object;
}

module.exports = canonicalize;
