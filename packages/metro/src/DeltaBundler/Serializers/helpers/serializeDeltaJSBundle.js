/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const crc32 = (require('buffer-crc32'): {unsigned(Buffer): number});
const {Readable} = require('stream');

import {type DeltaBundle} from '../deltaJSBundle';

exports.toJSON = (JSON.stringify: DeltaBundle => string);

// binary streaming format for delta bundles:
// FB DE 17 A5     magic number
// uint24 format version (1)
// bool reset
// uint32 sequenceIdLength of sequenceId
// char[sequenceIdLength] sequenceId
// uint32 preLength: length of "pre" section
// char[preLength] pre section
// char[4] pre section crc32
// uint32 postLength : lengthof "post" section
// char[postLength] post section
// module[], where module = {uint32 id, uint32 length, char[length] code, crc32(code)}

exports.toBinaryStream = (deltaBundle: DeltaBundle): Readable => {
  const gen = streamDeltaBundle(deltaBundle);

  return new Readable({
    read() {
      const {value = null} = gen.next();
      this.push(value);
    },
  });
};

const MAGIC_NUMBER = Buffer.of(0xfb, 0xde, 0x17, 0xa5);
const FORMAT_VERSION = [0x01, 0x00, 0x00];

function* streamDeltaBundle(deltaBundle) {
  yield MAGIC_NUMBER;
  yield Buffer.of(...FORMAT_VERSION, deltaBundle.reset ? 1 : 0);

  yield str(deltaBundle.id);
  yield preOrPostSection(deltaBundle.pre);
  yield preOrPostSection(deltaBundle.post);

  for (const m of deltaBundle.delta) {
    yield module(m);
  }
}

const SIZEOF_UINT32 = 4;

function str(value) {
  const size = Buffer.byteLength(value);
  const buffer = Buffer.allocUnsafe(size + SIZEOF_UINT32);
  buffer.writeUInt32LE(size, 0);
  buffer.write(value, SIZEOF_UINT32, size, 'utf8');
  return buffer;
}

const ABSENT_VALUE = 0xffffffff;
const ABSENT_BUFFER = [0xff, 0xff, 0xff, 0xff];
const EMPTY_CRC32 = [0x00, 0x00, 0x00, 0x00];
const EMPTY_PRE_OR_POST_SECTION = Buffer.of(...ABSENT_BUFFER, ...EMPTY_CRC32);

function preOrPostSection(section) {
  if (section.length === 0) {
    return EMPTY_PRE_OR_POST_SECTION;
  }

  const sectionCode = section.map(x => x[1]).join('\n') + '\n';
  const size = Buffer.byteLength(sectionCode, 'utf8');

  const buffer = Buffer.allocUnsafe(size + SIZEOF_UINT32 * 2); // space for size and checksum
  buffer.writeUInt32LE(size, 0);
  buffer.write(sectionCode, SIZEOF_UINT32, size, 'utf8');

  appendCRC32(buffer);

  return buffer;
}

function module(idAndCode) {
  const code = idAndCode[1];
  let buffer, length;
  if (code == null) {
    length = ABSENT_VALUE;
    buffer = Buffer.allocUnsafe(SIZEOF_UINT32 * 3); // id, length, crc32
  } else {
    length = Buffer.byteLength(code, 'utf8');
    buffer = Buffer.allocUnsafe(length + SIZEOF_UINT32 * 3);
    buffer.write(code, SIZEOF_UINT32 * 2, length, 'utf8');
  }
  buffer.writeUInt32LE(idAndCode[0], 0);
  buffer.writeUInt32LE(length, SIZEOF_UINT32);
  appendCRC32(buffer);
  return buffer;
}

function appendCRC32(buffer) {
  const CRC32_OFFSET = buffer.length - SIZEOF_UINT32;
  buffer.writeUInt32LE(
    crc32.unsigned(buffer.slice(0, CRC32_OFFSET)),
    CRC32_OFFSET,
  );
}
