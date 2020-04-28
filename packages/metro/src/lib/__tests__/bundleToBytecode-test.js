/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+js_foundation
 * @format
 */

'use strict';

jest.mock('metro-hermes-compiler', () => ({
  getFileLength: buffer => buffer.length,
}));

const bundleToBytecode = require('../bundleToBytecode');

const pre = [Buffer.from([1, 2, 3, 4])];
const post = [Buffer.from([5, 6, 7, 8])];

const modules = [
  [5, [Buffer.from([17, 18, 19, 20]), Buffer.from([21, 22, 23, 24])]],
  [3, [Buffer.from([9, 10, 11, 12]), Buffer.from([13, 14, 15, 16])]],
];

const getBufferWithNumber = number => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(number, 0);
  return buffer;
};

it('serializes a bundle into a bytecode bundle', () => {
  expect(
    bundleToBytecode({
      pre,
      post,
      modules,
    }).bytecode,
  ).toEqual(
    Buffer.concat([
      getBufferWithNumber(bundleToBytecode.MAGIC_NUMBER),
      getBufferWithNumber(6),
      // Module 3 comes before Module 5 in the final output
      ...[
        ...pre,
        ...modules[1][1],
        ...modules[0][1],
        ...post,
      ].flatMap(buffer => [getBufferWithNumber(4), buffer]),
    ]),
  );
});
