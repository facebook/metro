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

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = require('../../package.json').version;

/**
 * Returns a function that will return the transform cache key based on some
 * passed transform options.
 */
function getTransformCacheKeyFn(opts: {|
  +cacheVersion: string,
  +dynamicDepsInPackages: string,
  +projectRoots: $ReadOnlyArray<string>,
  +transformModulePath: string,
|}): (options: mixed) => string {
  const transformModuleHash = crypto
    .createHash('sha1')
    .update(fs.readFileSync(opts.transformModulePath))
    .digest('hex');

  const stableProjectRoots = opts.projectRoots.map(p => {
    return path.relative(path.join(__dirname, '../../../..'), p);
  });

  const cacheKeyParts = [
    'metro-cache',
    VERSION,
    opts.cacheVersion,
    stableProjectRoots
      .join(',')
      .split(path.sep)
      .join('-'),
    transformModuleHash,
    opts.dynamicDepsInPackages,
  ];

  const transformCacheKey = crypto
    .createHash('sha1')
    .update(cacheKeyParts.join('$'))
    .digest('hex');

  /* $FlowFixMe: dynamic requires prevent static typing :'(  */
  const transformer = require(opts.transformModulePath);

  const getCacheKey =
    typeof transformer.getCacheKey !== 'undefined'
      ? transformer.getCacheKey
      : (options: mixed) => '';

  return function(options: mixed): string {
    return transformCacheKey + getCacheKey(options);
  };
}

module.exports = getTransformCacheKeyFn;
