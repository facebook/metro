/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+javascript_foundation
 * @format
 * @flow
 */

'use strict';

const nullthrows = require('fbjs/lib/nullthrows');

import type {CustomTransformOptions} from '../JSTransformer/worker';

const PREFIX = 'transform.';

module.exports = function parseCustomTransformOptions(urlObj: {
  query?: {[string]: string},
}): CustomTransformOptions {
  const customTransformOptions = Object.create(null);
  const query = nullthrows(urlObj.query);

  Object.keys(query).forEach(key => {
    if (key.startsWith(PREFIX)) {
      customTransformOptions[key.substr(PREFIX.length)] = query[key];
    }
  });

  return customTransformOptions;
};
