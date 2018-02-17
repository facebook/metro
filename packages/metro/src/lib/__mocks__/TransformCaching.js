/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const crypto = require('crypto');
const jsonStableStringify = require('json-stable-stringify');

const transformCache = new Map();

const transformCacheKeyOf = props =>
  props.filePath +
  '-' +
  crypto
    .createHash('md5')
    .update(props.sourceCode)
    .update(
      props.getTransformCacheKey(
        props.sourceCode,
        props.filePath,
        props.transformOptions,
      ),
    )
    .update(jsonStableStringify(props.transformOptions || {}))
    .digest('hex');

class TransformCacheMock {
  constructor() {
    this.mock = {
      lastWrite: null,
      reset: () => {
        transformCache.clear();
        this.mock.lastWrite = null;
      },
    };
  }

  writeSync(props) {
    transformCache.set(transformCacheKeyOf(props), props.result);
    this.mock.lastWrite = props;
  }

  readSync(props) {
    return transformCache.get(transformCacheKeyOf(props));
  }
}

module.exports = {mocked: () => new TransformCacheMock()};
