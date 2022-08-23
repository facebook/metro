/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 * @flow strict-local
 */

'use strict';

import type {CustomResolverOptions} from '../../../metro-resolver/src/types';

const nullthrows = require('nullthrows');

const PREFIX = 'resolver.';

module.exports = function parseCustomResolverOptions(urlObj: {
  +query?: {[string]: string, ...},
  ...
}): CustomResolverOptions {
  const customResolverOptions: {
    __proto__: null,
    [string]: mixed,
    ...
  } = Object.create(null);
  const query = nullthrows(urlObj.query);

  Object.keys(query).forEach((key: string) => {
    if (key.startsWith(PREFIX)) {
      customResolverOptions[key.substr(PREFIX.length)] = query[key];
    }
  });

  return customResolverOptions;
};
