/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

import type {TransformerConfig} from './Worker';
import type {JsTransformerConfig} from 'metro-transform-worker';

const VERSION = require('../../package.json').version;
const crypto = require('crypto');
const getCacheKey = require('metro-cache-key');

type CacheKeyProvider = {
  getCacheKey?: JsTransformerConfig => string,
};

function getTransformCacheKey(opts: {
  +cacheVersion: string,
  +projectRoot: string,
  +transformerConfig: TransformerConfig,
}): string {
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
        getCacheKey([require.resolve(transformerPath)]),
        transformerKey,
        transformerConfig.globalPrefix,
      ].join('$'),
    )
    .digest('hex');
}

module.exports = getTransformCacheKey;
