/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

'use strict';

import type {CustomTransformOptions} from 'metro-transform-worker';

const nullthrows = require('nullthrows');

const PREFIX = 'transform.';

module.exports = function parseCustomTransformOptions(urlObj: {
  +query?: {[string]: string, ...},
  ...
}): CustomTransformOptions {
  const customTransformOptions = Object.create(null);
  const query = nullthrows(urlObj.query);

  Object.keys(query).forEach((key: string) => {
    if (key.startsWith(PREFIX)) {
      // $FlowFixMe[prop-missing]
      customTransformOptions[key.substr(PREFIX.length)] = query[key];
    }
  });

  return customTransformOptions;
};
