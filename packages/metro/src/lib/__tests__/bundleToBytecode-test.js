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

const bundleToBytecode = require('../bundleToBytecode');

const pre = [Buffer.from([1, 2, 3, 4])];
const post = [Buffer.from([5, 6, 7, 8])];

const modules = [
  [5, [Buffer.from([17, 18, 19, 20]), Buffer.from([21, 22, 23, 24])]],
  [3, [Buffer.from([9, 10, 11, 12]), Buffer.from([13, 14, 15, 16])]],
];

it('serializes a bundle into a bytecode bundle', () => {
  expect(
    bundleToBytecode({
      pre,
      post,
      modules,
    }).bytecode,
    // Module 3 comes before Module 5 in the final output
  ).toEqual(
    Buffer.concat([...pre, ...modules[1][1], ...modules[0][1], ...post]),
  );
});
