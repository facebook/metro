/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */
'use strict';

/* global Buffer: true */

const crypto = require('crypto');

const isUTF8 = encoding => /^utf-?8$/i.test(encoding);

const constantFor = encoding =>
  /^ascii$/i.test(encoding)
    ? 1
    : isUTF8(encoding)
      ? 2
      : /^(?:utf-?16(?:le)?|ucs-?2)$/.test(encoding)
        ? 3
        : 0;

module.exports = function(
  code: Buffer | string,
  encoding: 'ascii' | 'utf8' | 'utf16le' = 'utf8',
): Buffer {
  const buffer: Buffer = asBuffer(code, encoding);
  const hash = crypto.createHash('sha1');
  hash.update(buffer);
  const digest = hash.digest('buffer');
  const signature = Buffer.alloc(digest.length + 1);
  digest.copy(signature);
  signature.writeUInt8(
    constantFor(tryAsciiPromotion(buffer, encoding)),
    signature.length - 1,
  );
  return signature;
};

function tryAsciiPromotion(buffer, encoding) {
  if (!isUTF8(encoding)) {
    return encoding;
  }
  for (let i = 0, n = buffer.length; i < n; i++) {
    if (buffer[i] > 0x7f) {
      return encoding;
    }
  }
  return 'ascii';
}

function asBuffer(x, encoding): Buffer {
  if (typeof x !== 'string') {
    return x;
  }
  return Buffer.from(x, encoding);
}
