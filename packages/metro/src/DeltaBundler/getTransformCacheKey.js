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
const getKeyFromFiles = require('../lib/getKeyFromFiles');
const path = require('path');

const VERSION = require('../../package.json').version;

import type {TransformerConfig} from './Worker';
import type {JsTransformerConfig} from 'metro-transform-worker';

type CacheKeyProvider = {
  getCacheKey?: JsTransformerConfig => string,
};
/**
 * Returns a function that will return the transform cache key based on some
 * passed transform options.
 */
function getTransformCacheKey(opts: {|
  +cacheVersion: string,
  +projectRoot: string,
  +transformerConfig: TransformerConfig,
|}): string {
  const {transformerPath, transformerConfig} = opts.transformerConfig;

  // eslint-disable-next-line no-useless-call
  const Transformer = (require.call(null, transformerPath): CacheKeyProvider);
  const transformerKey = Transformer.getCacheKey
    ? Transformer.getCacheKey(transformerConfig)
    : '';

  return crypto
    .createHash('sha1')
    .update(
      [
        'metro-cache',
        VERSION,
        opts.cacheVersion,
        path.relative(path.join(__dirname, '../../..'), opts.projectRoot),
        getKeyFromFiles([require.resolve(transformerPath)]),
        transformerKey,
      ].join('$'),
    )
    .digest('hex');
}

module.exports = getTransformCacheKey;
