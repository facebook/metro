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

const crypto = require('crypto');
const canonicalize = require('metro-core/private/canonicalize');

function stableHash(value: mixed): Buffer {
  return (
    crypto
      .createHash('md5')
      /* $FlowFixMe(>=0.95.0 site=react_native_fb) This comment suppresses an
       * error found when Flow v0.95 was deployed. To see the error, delete this
       * comment and run Flow. */
      .update(JSON.stringify(value, canonicalize))
      .digest('buffer')
  );
}

module.exports = stableHash;
