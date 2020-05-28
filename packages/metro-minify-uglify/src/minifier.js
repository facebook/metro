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

const uglify = require('uglify-es');

import type {BasicSourceMap} from 'metro-source-map';
import type {MinifierResult, MinifierOptions} from 'metro-transform-worker';

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
}: MinifierOptions): {
  code: string,
  map: ?string,
  ...
} {
  const options = {
    ...config,
    mangle: {
      ...config.mangle,
      reserved,
    },
    sourceMap: {
      ...config.sourceMap,
      content: map,
    },
  };

  /* $FlowFixMe(>=0.111.0 site=react_native_fb) This comment suppresses an
   * error found when Flow v0.111 was deployed. To see the error, delete this
   * comment and run Flow. */
  const result = uglify.minify(code, options);

  if (result.error) {
    throw result.error;
  }

  return {
    code: result.code,
    map: result.map,
  };
}

module.exports = minifier;
