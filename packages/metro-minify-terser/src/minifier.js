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
import type {
  MinifierResult,
  MinifierOptions,
} from 'metro/src/shared/types.flow.js';

function minifier(options: MinifierOptions): MinifierResult {
  const result = minify(options);

  if (!options.map || result.map == null) {
    return {code: result.code};
  }

  const map: BasicSourceMap = JSON.parse(result.map);

  return {code: result.code, map: {...map, sources: [options.filename]}};
}

function minify({
  code,
  map,
  reserved,
  config,
}: MinifierOptions): {code: string, map: ?string} {
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
  const result = terser.minify(code, options);

  if (result.error) {
    throw result.error;
  }

  return {
    code: result.code,
    // eslint-disable-next-line lint/flow-no-fixme
    // $FlowFixMe flow cannot coerce the uglify options after using spread.
    map: result.map,
  };
}

module.exports = minifier;
