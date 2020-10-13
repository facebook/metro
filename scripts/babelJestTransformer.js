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

const createCacheKeyFunction = require('@jest/create-cache-key-function')
  .default;

const {transformSync: babelTransformSync} = require('@babel/core');

// eslint-disable-next-line prettier/prettier
/*::
import type {TransformResult} from '@babel/core';
*/

const BABEL_CONFIG_PATH = require.resolve('../babel.config.js');
const babelConfigCacheKey = require('../babel.config.js').getCacheKey();

module.exports = {
  process(src /*: string */, file /*: string */) /*: TransformResult */ {
    return babelTransformSync(src, {
      compact: false,
      configFile: BABEL_CONFIG_PATH,
      filename: file,
      sourceMaps: 'both',
    });
  },

  getCacheKey: (createCacheKeyFunction(
    [__filename, require.resolve('@babel/core/package.json')],
    [babelConfigCacheKey],
  ) /*: any */),
};
