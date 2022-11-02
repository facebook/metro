/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');

function getCacheKey(files: Array<string>): string {
  return files
    .reduce(
      (hash, file) => hash.update('\0', 'utf8').update(fs.readFileSync(file)),
      crypto.createHash('md5'),
    )
    .digest('hex');
}

module.exports = getCacheKey;
