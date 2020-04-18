/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

import type {BytecodeBundle, BundleMetadata} from './bundle-modules/types.flow';

/**
 * Serializes a bundle into a Bytecode bundle.
 */
function bundleToBytecode(
  bundle: BytecodeBundle,
): {|+bytecode: Buffer, +metadata: BundleMetadata|} {
  const buffers = [];
  if (bundle.pre) {
    buffers.push(bundle.pre);
  }

  const modules = [];

  const sortedModules = bundle.modules
    .slice()
    // The order of the modules needs to be deterministic in order for source
    // maps to work properly.
    .sort((a: [number, Buffer], b: [number, Buffer]) => a[0] - b[0]);

  for (const [id, bytecode] of sortedModules) {
    if (bytecode.length > 0) {
      buffers.push(bytecode);
    }
    modules.push([id, bytecode.length]);
  }

  if (bundle.post.length > 0) {
    buffers.push(bundle.post);
  }

  return {
    bytecode: Buffer.concat(buffers),
    metadata: {
      pre: bundle.pre ? bundle.pre.length : 0,
      post: bundle.post.length,
      modules,
    },
  };
}

module.exports = bundleToBytecode;
