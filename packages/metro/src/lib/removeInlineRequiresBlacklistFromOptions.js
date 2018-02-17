/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

import type {Options as JSTransformerOptions} from '../JSTransformer/worker';

function removeInlineRequiresBlacklistFromOptions(
  path: string,
  transformOptions: JSTransformerOptions,
): JSTransformerOptions {
  if (typeof transformOptions.inlineRequires === 'object') {
    // $FlowIssue #23854098 - Object.assign() loses the strictness of an object in flow
    return {
      ...transformOptions,
      inlineRequires: !(path in transformOptions.inlineRequires.blacklist),
    };
  }

  return transformOptions;
}

module.exports = removeInlineRequiresBlacklistFromOptions;
