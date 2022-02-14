/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

import type {
  BundleMetadata,
  BytecodeBundle,
} from 'metro-runtime/src/modules/types.flow';

const {getFileLength} = require('metro-hermes-compiler');

// The magic number is used as a header for bytecode.
// It represents a Metro tunnel in binary.
//
// 11111111
// 11100111
// 11000011
// 11000011
const MAGIC_NUMBER = 0xffe7c3c3;

function getFileHeader(moduleCount: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32LE(MAGIC_NUMBER, 0);
  buffer.writeUInt32LE(moduleCount, 4);
  return buffer;
}

function addModuleHeader(buffer: Buffer): [Buffer, Buffer] {
  const fileLength = getFileLength(buffer, 0);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(fileLength, 0);
  return [header, buffer];
}

/**
 * A bytecode bundle has the following format:
 *
 * 4 bytes MAGIC_NUMBER
 * 4 bytes Module count
 * 4 bytes Module length N + N bytes
 * ...
 *
 */
function bundleToBytecode(bundle: BytecodeBundle): {|
  +bytecode: Buffer,
  +metadata: BundleMetadata,
|} {
  const buffers = [];

  if (bundle.pre.length) {
    buffers.push(...bundle.pre);
  }

  const modules = [];

  const sortedModules = bundle.modules
    .slice()
    // In a JS bundle, the order of modules needs to be deterministic for source
    // maps to work. This constraint is not necessary for bytecode bundles but
    // is kept for consistency.
    .sort((a, b) => a[0] - b[0]);

  for (const [id, bytecodeBundle] of sortedModules) {
    buffers.push(...bytecodeBundle);
    // Use the size of the last item in `bytecodeBundle` which is always
    // the actual module without headers.
    modules.push([id, bytecodeBundle[bytecodeBundle.length - 1].length]);
  }

  if (bundle.post.length) {
    buffers.push(...bundle.post);
  }

  return {
    bytecode: Buffer.concat([
      getFileHeader(buffers.length),
      ...buffers.flatMap(addModuleHeader),
    ]),
    metadata: {
      pre: bundle.pre ? bundle.pre.length : 0,
      post: bundle.post.length,
      modules,
    },
  };
}

module.exports = bundleToBytecode;
module.exports.MAGIC_NUMBER = MAGIC_NUMBER;
