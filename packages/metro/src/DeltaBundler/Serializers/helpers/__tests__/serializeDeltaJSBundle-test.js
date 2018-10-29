/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @flow
 * @format
 */

'use strict';

const crc32 = (require('buffer-crc32'): {unsigned(Buffer): number});
const serializeDeltaJSBundle = require('../serializeDeltaJSBundle');

const baseBundle = {
  base: true,
  revisionId: 'arbitrary ID',
  pre: 'arbitrary pre string',
  post: 'arbitrary post string',
  modules: [
    [11, 'arbitrary module source'],
    [111111, 'arbitrary module source 2'],
  ],
};

const deltaBundle = {
  base: false,
  revisionId: 'arbitrary ID 2',
  modules: [
    [11, 'arbitrary module source'],
    [111111, 'arbitrary module source 2'],
  ],
  deleted: [1111, 11111111],
};

it('can serialize to a string', () => {
  expect(serializeDeltaJSBundle.toJSON(baseBundle)).toEqual(
    JSON.stringify(baseBundle),
  );
  expect(serializeDeltaJSBundle.toJSON(deltaBundle)).toEqual(
    JSON.stringify(deltaBundle),
  );
});

const SIZEOF_UINT32 = 4;
const EMPTY_STRING = 0xffffffff;

describe('binary stream serialization', () => {
  const VERSION_OFFSET = 4;
  const BASE_OFFSET = VERSION_OFFSET + 3;
  const BODY_OFFSET = BASE_OFFSET + 1;

  const EMPTY_CRC32 = 0;

  const stream = serializeDeltaJSBundle.toBinaryStream(baseBundle);
  const serialized = consumeStream(stream);

  let buffer;
  beforeEach(async () => {
    buffer = await serialized;
  });

  const subBuffer = (offset, length) => buffer.slice(offset, offset + length);

  it('starts with the magic number', () => {
    expect(subBuffer(0, SIZEOF_UINT32)).toEqual(
      Buffer.of(0xfb, 0xde, 0x17, 0xa5),
    );
  });

  it('contains `1` as format version number', () => {
    //eslint-disable-next-line no-bitwise
    expect(buffer.readUInt32LE(VERSION_OFFSET) & 0xffffff).toEqual(1);
  });

  it('has the base flag set', () => {
    expect(buffer.readUInt8(BASE_OFFSET)).toEqual(1);
  });

  const expectedRevisionId = binString(baseBundle.revisionId);
  it('contains the revision ID after the magic number', () => {
    expect(subBuffer(BODY_OFFSET, expectedRevisionId.length)).toEqual(
      expectedRevisionId,
    );
  });

  const preOffset = BODY_OFFSET + expectedRevisionId.length;
  const expectedPre = preOrPostSection(baseBundle.pre);
  it('has data for pre-scripts', () => {
    expect(subBuffer(preOffset, expectedPre.length)).toEqual(expectedPre);
  });

  const postOffset = preOffset + expectedPre.length;
  const expectedPost = preOrPostSection(baseBundle.post);
  it('has data for post-scripts', () => {
    expect(subBuffer(postOffset, expectedPost.length)).toEqual(expectedPost);
  });

  const modulesOffset = postOffset + expectedPost.length;
  it('has module data', () => {
    expect(buffer.slice(modulesOffset)).toEqual(
      Buffer.concat(baseBundle.modules.map(binModule)),
    );
  });

  describe('empty pre/post', () => {
    const stream = serializeDeltaJSBundle.toBinaryStream({
      ...baseBundle,
      pre: '',
      post: '',
    });
    const serialized = consumeStream(stream);

    beforeEach(async () => {
      buffer = await serialized;
    });

    it('contains no pre scripts', () => {
      expect(buffer.readUInt32LE(preOffset)).toEqual(EMPTY_STRING);
      expect(buffer.readUInt32LE(preOffset + SIZEOF_UINT32)).toEqual(
        EMPTY_CRC32,
      );
    });

    it('contains no post scripts', () => {
      expect(buffer.readUInt32LE(preOffset + SIZEOF_UINT32 * 2)).toEqual(
        EMPTY_STRING,
      );
      expect(buffer.readUInt32LE(preOffset + SIZEOF_UINT32 * 3)).toEqual(
        EMPTY_CRC32,
      );
    });
  });

  describe('delta bundle:', () => {
    const stream = serializeDeltaJSBundle.toBinaryStream(deltaBundle);
    const serialized = consumeStream(stream);

    beforeEach(async () => {
      buffer = await serialized;
    });

    it('has a base flag of 0', () => {
      expect(buffer.readUInt8(BASE_OFFSET)).toEqual(0);
    });

    const expectedRevisionId = binString(deltaBundle.revisionId);
    it('contains the revision ID after the magic number', () => {
      expect(subBuffer(BODY_OFFSET, expectedRevisionId.length)).toEqual(
        expectedRevisionId,
      );
    });

    const modulesOffset = BODY_OFFSET + expectedRevisionId.length;
    it('has module and deleted data', () => {
      expect(buffer.slice(modulesOffset)).toEqual(
        Buffer.concat(
          deltaBundle.modules
            .concat(deltaBundle.deleted.map(id => [id, null]))
            .map(binModule),
        ),
      );
    });
  });
});

function consumeStream(stream): Promise<Buffer> {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream
      .on('data', chunk => chunks.push(chunk))
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function binUint32LE(value) {
  const b = Buffer.alloc(SIZEOF_UINT32);
  b.writeUInt32LE(value, 0);
  return b;
}

function binString(value) {
  const length = Buffer.byteLength(value);
  const buffer = Buffer.alloc(length + SIZEOF_UINT32); // extra space for size
  buffer.writeUInt32LE(length, 0);
  buffer.write(value, SIZEOF_UINT32, length, 'utf8');
  return buffer;
}

function binModule([id, code]: [number, ?string]) {
  const idAndCodeBuffer = Buffer.concat([
    binUint32LE(id),
    code == null ? binUint32LE(EMPTY_STRING) : binString(code),
  ]);
  const crc32Buffer = binUint32LE(crc32.unsigned(idAndCodeBuffer));
  return Buffer.concat([idAndCodeBuffer, crc32Buffer]);
}

function preOrPostSection(section) {
  const serialized = binString(section);
  return Buffer.concat([serialized, binUint32LE(crc32.unsigned(serialized))]);
}
