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

const canonicalize = require('metro-core/src/canonicalize');
const crypto = require('crypto');

function stableHash(value: mixed) {
  return crypto
    .createHash('md4')
    .update(JSON.stringify(value, canonicalize))
    .digest('buffer');
}

module.exports = stableHash;
