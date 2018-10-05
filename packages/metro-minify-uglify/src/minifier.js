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

import type {BabelSourceMap} from '@babel/core';
import type {
  MinifierResult,
  MinifierOptions,
} from 'metro/src/shared/types.flow.js';

function minifier(options: MinifierOptions): MinifierResult {
  const result = minify(options);

  if (!options.map || result.map == null) {
    return {code: result.code};
  }

  const map: BabelSourceMap = JSON.parse(result.map);
  map.sources = [options.filename];

  return {code: result.code, map};
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
    sourceMap: {
      ...config.sourceMap,
      content: map,
    },
  };

  const result = uglify.minify(code, options);

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
