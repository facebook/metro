/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
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
