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

import type {Bundle} from '../types.flow';

/**
 * Serializes a bundle into a plain JS bundle.
 */
function bundleToString(bundle: Bundle): string {
  return [
    bundle.pre,
    bundle.modules
      .slice()
      // The order of the modules needs to be deterministic in order for source
      // maps to work properly.
      .sort((a, b) => a[0] - b[0])
      .map(entry => entry[1])
      .join('\n'),
    bundle.post,
  ].join('\n');
}

module.exports = bundleToString;
