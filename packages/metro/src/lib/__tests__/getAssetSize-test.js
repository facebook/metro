/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

const {getAssetSize} = require('../getAssetSize');

const WIDTH = 300;
const HEIGHT = 200;
const KTX1_IDENTIFIER = [
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
];
const KTX2_IDENTIFIER = [
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
];

describe('getAssetSize', () => {
  test.each([
    ['bmp', createBmp()],
    ['gif', createGif()],
    ['jpg', createJpeg()],
    ['jpeg', createJpeg()],
    ['png', createPng()],
    ['psd', createPsd()],
    ['svg', createSvg()],
    ['tiff', createTiff()],
    ['webp', createWebp()],
    ['ktx', createKtx1('little')],
    ['ktx', createKtx1('big')],
    ['ktx', createKtx2()],
  ])('parses a valid %s image', (type, content) => {
    expect(getAssetSize(type, content, `/root/image.${type}`)).toEqual({
      width: WIDTH,
      height: HEIGHT,
    });
  });

  test('rejects an empty image', () => {
    expect(() =>
      getAssetSize('png', Buffer.alloc(0), '/root/empty.png'),
    ).toThrow('Invalid png image asset: /root/empty.png');
  });

  test('rejects content that does not match the asset type', () => {
    expect(() =>
      getAssetSize('png', createJpeg(), '/root/disguised.png'),
    ).toThrow('Invalid png image asset: /root/disguised.png');
  });

  test('rejects a truncated image header', () => {
    expect(() =>
      getAssetSize(
        'png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        '/root/truncated.png',
      ),
    ).toThrow('Invalid png image asset: /root/truncated.png');
  });

  test.each([
    ['KTX1', createKtx1('little').subarray(0, 44)],
    ['KTX2', createKtx2().subarray(0, 28)],
  ])('rejects a truncated %s header', (_, content) => {
    expect(() => getAssetSize('ktx', content, '/root/truncated.ktx')).toThrow(
      'Invalid ktx image asset: /root/truncated.ktx',
    );
  });

  test('rejects non-positive dimensions', () => {
    const content = createPng();
    content.writeUInt32BE(0, 16);

    expect(() => getAssetSize('png', content, '/root/zero-width.png')).toThrow(
      'Invalid png image asset: /root/zero-width.png',
    );
  });

  test.each([
    ['JXL', createZeroLengthJxlBox()],
    ['HEIF', createZeroLengthHeifBox()],
    ['ICNS', createZeroLengthIcnsEntry()],
  ])(
    'rejects a malformed %s payload without auto-detecting it',
    (_, content) => {
      expect(() => getAssetSize('png', content, '/root/malicious.png')).toThrow(
        'Invalid png image asset: /root/malicious.png',
      );
    },
  );
});

function createBmp() {
  const content = Buffer.alloc(26);
  content.write('BM', 0, 'ascii');
  content.writeUInt32LE(40, 14);
  content.writeInt32LE(WIDTH, 18);
  content.writeInt32LE(HEIGHT, 22);
  return content;
}

function createGif() {
  const content = Buffer.alloc(10);
  content.write('GIF89a', 0, 'ascii');
  content.writeUInt16LE(WIDTH, 6);
  content.writeUInt16LE(HEIGHT, 8);
  return content;
}

function createJpeg() {
  const content = Buffer.alloc(21);
  content.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  content.writeUInt16BE(HEIGHT, 7);
  content.writeUInt16BE(WIDTH, 9);
  return content;
}

function createPng() {
  const content = Buffer.alloc(24);
  content.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  content.write('IHDR', 12, 'ascii');
  content.writeUInt32BE(WIDTH, 16);
  content.writeUInt32BE(HEIGHT, 20);
  return content;
}

function createPsd() {
  const content = Buffer.alloc(22);
  content.set([0x38, 0x42, 0x50, 0x53, 0x00, 0x01]);
  content.writeUInt32BE(HEIGHT, 14);
  content.writeUInt32BE(WIDTH, 18);
  return content;
}

function createSvg() {
  return Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"/>`,
  );
}

function createTiff() {
  const content = Buffer.alloc(34);
  content.set([0x49, 0x49, 0x2a, 0x00]);
  content.writeUInt32LE(8, 4);
  content.writeUInt16LE(2, 8);
  writeTiffEntry(content, 10, 256, WIDTH);
  writeTiffEntry(content, 22, 257, HEIGHT);
  return content;
}

function writeTiffEntry(content, offset, tag, value) {
  content.writeUInt16LE(tag, offset);
  content.writeUInt16LE(4, offset + 2);
  content.writeUInt32LE(1, offset + 4);
  content.writeUInt32LE(value, offset + 8);
}

function createWebp() {
  const content = Buffer.alloc(30);
  content.write('RIFF', 0, 'ascii');
  content.writeUInt32LE(content.length - 8, 4);
  content.write('WEBP', 8, 'ascii');
  content.write('VP8X', 12, 'ascii');
  content.writeUInt32LE(10, 16);
  content.writeUIntLE(WIDTH - 1, 24, 3);
  content.writeUIntLE(HEIGHT - 1, 27, 3);
  return content;
}

function createKtx1(endianness) {
  const content = Buffer.alloc(64);
  content.set(KTX1_IDENTIFIER);
  if (endianness === 'little') {
    content.set([0x01, 0x02, 0x03, 0x04], 12);
    content.writeUInt32LE(WIDTH, 36);
    content.writeUInt32LE(HEIGHT, 40);
  } else {
    content.set([0x04, 0x03, 0x02, 0x01], 12);
    content.writeUInt32BE(WIDTH, 36);
    content.writeUInt32BE(HEIGHT, 40);
  }
  return content;
}

function createKtx2() {
  const content = Buffer.alloc(80);
  content.set(KTX2_IDENTIFIER);
  content.writeUInt32LE(WIDTH, 20);
  content.writeUInt32LE(HEIGHT, 24);
  return content;
}

function createZeroLengthJxlBox() {
  return Buffer.from([0x00, 0x00, 0x00, 0x00, 0x4a, 0x58, 0x4c, 0x20]);
}

function createZeroLengthHeifBox() {
  return Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
  ]);
}

function createZeroLengthIcnsEntry() {
  return Buffer.from([
    0x69, 0x63, 0x6e, 0x73, 0x00, 0x00, 0x00, 0x10, 0x69, 0x63, 0x30, 0x37,
    0x00, 0x00, 0x00, 0x00,
  ]);
}
