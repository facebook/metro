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

import type {Bundle, DeltaBundle} from '../types.flow';

/**
 * Patches a bundle with a delta.
 */
function patchBundle(bundle: Bundle, delta: Bundle | DeltaBundle): Bundle {
  if (delta.base) {
    return delta;
  }

  const map = new Map(bundle.modules);

  for (const [key, value] of delta.modules) {
    map.set(key, value);
  }

  for (const key of delta.deleted) {
    map.delete(key);
  }

  const modules = Array.from(map.entries());

  return {
    base: true,
    revisionId: delta.revisionId,
    pre: bundle.pre,
    post: bundle.post,
    modules,
  };
}

module.exports = patchBundle;
