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

const PRAGMA = '//# offsetTable=';

/**
 * Serializes a bundle into a plain JS bundle.
 */
function bundleToString(bundle: Bundle, embedDelta: boolean): string {
  let output = bundle.pre + '\n';
  let modulesTable = '';

  const sortedModules = bundle.modules
    .slice()
    // The order of the modules needs to be deterministic in order for source
    // maps to work properly.
    .sort((a, b) => a[0] - b[0]);

  for (const [id, code] of sortedModules.slice(0, -1)) {
    output += code + '\n';
    modulesTable += `[${id}, ${code.length}],`;
  }

  const [lastId, lastCode] = sortedModules[sortedModules.length - 1];
  output += lastCode + '\n';
  modulesTable += `[${lastId},${lastCode.length}]`;

  output += bundle.post;

  if (embedDelta) {
    output += `\n${PRAGMA}{"revisionId":"${bundle.revisionId}","pre":${
      bundle.pre.length
    },"post":${bundle.post.length},"modules":[${modulesTable}]}`;
  }

  return output;
}

module.exports = bundleToString;
