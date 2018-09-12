/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
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
  +babelTransformerPath: string,
  +cacheVersion: string,
  +projectRoot: string,
  +transformerPath: string,
|}): (options: mixed) => string {
  const transformModuleHash = getKeyFromFile(opts.transformerPath);

  // eslint-disable-next-line lint/flow-no-fixme
  /* $FlowFixMe: dynamic requires prevent static typing :'(  */
  const transformer = require(opts.transformerPath);

  const cacheFiles =
    typeof transformer.getTransformDependencies !== 'undefined'
      ? transformer.getTransformDependencies()
      : [];

  const babelTransformerModuleHash = getKeyFromFile(opts.babelTransformerPath);

  const cacheKeyParts = [
    'metro-cache',
    VERSION,
    opts.cacheVersion,
    path.relative(path.join(__dirname, '../../../..'), opts.projectRoot),
    transformModuleHash,
    babelTransformerModuleHash,
    ...cacheFiles.map(getKeyFromFile),
  ];

  const transformCacheKey = crypto
    .createHash('sha1')
    .update(cacheKeyParts.join('$'))
    .digest('hex');

  return function(options: mixed): string {
    return transformCacheKey;
  };
}

function getKeyFromFile(filePath: string) {
  return crypto
    .createHash('sha1')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

module.exports = getTransformCacheKeyFn;
