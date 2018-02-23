/**
 * Copyright (c) 2018-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const crypto = require('crypto');

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

function stableHash(value: mixed) {
  return crypto
    .createHash('md5')
    .update(JSON.stringify(value, canonicalize))
    .digest();
}

module.exports = stableHash;
