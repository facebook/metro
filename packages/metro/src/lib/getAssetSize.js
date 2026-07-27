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

// $FlowFixMe[untyped-import] probe-image-size does not provide Flow types.
import probeImageSize from 'probe-image-size/sync';

type Dimensions = {
  readonly width: number,
  readonly height: number,
};

type ImageParser = (content: Buffer) => ?Dimensions;

const probeParsers: {[string]: ImageParser} = probeImageSize.parsers;

const parsers: {[string]: ImageParser} = {
  bmp: probeParsers.bmp,
  gif: probeParsers.gif,
  jpeg: probeParsers.jpeg,
  jpg: probeParsers.jpeg,
  png: probeParsers.png,
  psd: probeParsers.psd,
  svg: probeParsers.svg,
  tiff: probeParsers.tiff,
  webp: probeParsers.webp,
  ktx: parseKtx,
};

const KTX1_IDENTIFIER = Buffer.from([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const KTX2_IDENTIFIER = Buffer.from([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const KTX1_HEADER_LENGTH = 64;
const KTX2_HEADER_LENGTH = 80;

export function getAssetSize(
  type: string,
  content: Buffer,
  filePath: string,
): Dimensions {
  const parser = parsers[type];
  let dimensions;

  try {
    dimensions = parser?.(content);
  } catch {
    throw createInvalidImageError(type, filePath);
  }

  if (
    dimensions == null ||
    !Number.isFinite(dimensions.width) ||
    !Number.isFinite(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    throw createInvalidImageError(type, filePath);
  }

  return {
    width: dimensions.width,
    height: dimensions.height,
  };
}

function parseKtx(content: Buffer): ?Dimensions {
  if (
    content.length >= KTX1_HEADER_LENGTH &&
    content.subarray(0, KTX1_IDENTIFIER.length).equals(KTX1_IDENTIFIER)
  ) {
    const endianness = content.subarray(12, 16);
    if (endianness.equals(Buffer.from([0x01, 0x02, 0x03, 0x04]))) {
      return {
        width: content.readUInt32LE(36),
        height: content.readUInt32LE(40),
      };
    }
    if (endianness.equals(Buffer.from([0x04, 0x03, 0x02, 0x01]))) {
      return {
        width: content.readUInt32BE(36),
        height: content.readUInt32BE(40),
      };
    }
    return null;
  }

  if (
    content.length >= KTX2_HEADER_LENGTH &&
    content.subarray(0, KTX2_IDENTIFIER.length).equals(KTX2_IDENTIFIER)
  ) {
    return {
      width: content.readUInt32LE(20),
      height: content.readUInt32LE(24),
    };
  }

  return null;
}

function createInvalidImageError(type: string, filePath: string): Error {
  return new Error(`Invalid ${type} image asset: ${filePath}`);
}
