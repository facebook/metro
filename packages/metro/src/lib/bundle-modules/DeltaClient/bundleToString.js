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

import type {Bundle, BundleMetadata} from '../types.flow';

/**
 * Serializes a bundle into a plain JS bundle.
 */
function bundleToString(
  bundle: Bundle,
): {|
  +code: string,
  +metadata: BundleMetadata,
|} {
  let code = bundle.pre + '\n';
  const modules = [];

  const sortedModules = bundle.modules
    .slice()
    // The order of the modules needs to be deterministic in order for source
    // maps to work properly.
    .sort((a, b) => a[0] - b[0]);

  for (const [id, moduleCode] of sortedModules) {
    code += moduleCode + '\n';
    modules.push([id, moduleCode.length]);
  }

  code += bundle.post;

  return {
    code,
    metadata: {pre: bundle.pre.length, post: bundle.post.length, modules},
  };
}

module.exports = bundleToString;
