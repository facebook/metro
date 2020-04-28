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

function bundleToBytecode(
  bundle: BytecodeBundle,
): {|+bytecode: Buffer, +metadata: BundleMetadata|} {
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
    bytecode: Buffer.concat(buffers),
    metadata: {
      pre: bundle.pre ? bundle.pre.length : 0,
      post: bundle.post.length,
      modules,
    },
  };
}

module.exports = bundleToBytecode;
