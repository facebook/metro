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

import type {BasicSourceMap} from 'metro-source-map';
import type {MinifierOptions, MinifierResult} from 'metro-transform-worker';

const terser = require('terser');

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
    output: {
      // Mitigate https://github.com/terser/terser/issues/1341 - Terser may
      // set its internal data on this object, so give it a shallow copy.
      ...(config.output ?? {}),
    },
    mangle:
      config.mangle === false
        ? false
        : {
            ...config.mangle,
            reserved,
          },
    sourceMap: map
      ? config.sourceMap === false
        ? false
        : {
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
