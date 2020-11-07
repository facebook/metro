/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const terser = require('terser');

import type {BasicSourceMap} from 'metro-source-map';
import type {MinifierResult, MinifierOptions} from 'metro-transform-worker';

async function minifier(options: MinifierOptions): Promise<MinifierResult> {
  const result = await minify(options);

  if (!options.map || result.map == null) {
    return {code: result.code};
  }

  const map: BasicSourceMap = JSON.parse(result.map);

  return {code: result.code, map: {...map, sources: [options.filename]}};
}

async function minify({
  code,
  map,
  reserved,
  config,
}: MinifierOptions): Promise<{code: string, map: ?string}> {
  const options = {
    ...config,
    mangle: {
      ...config.mangle,
      reserved,
    },
    sourceMap: map
      ? {
          ...config.sourceMap,
          content: map,
        }
      : false,
  };

  /* $FlowFixMe(>=0.111.0 site=react_native_fb) This comment suppresses an
   * error found when Flow v0.111 was deployed. To see the error, delete this
   * comment and run Flow. */
  const result = await terser.minify(code, options);

  return {
    code: result.code,
    map: result.map,
  };
}

module.exports = minifier;
