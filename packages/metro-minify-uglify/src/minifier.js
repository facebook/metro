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
}: MinifierOptions): {code: string, map: ?string} {
  const result = uglify.minify(code, {
    mangle: {
      toplevel: false,
      reserved,
    },
    output: {
      ascii_only: true,
      quote_style: 3,
      wrap_iife: true,
    },
    sourceMap: {
      content: map,
      includeSources: false,
    },
    toplevel: false,
    compress: {
      // reduce_funcs inlines single-use function, which cause perf regressions.
      reduce_funcs: false,
    },
  });

  if (result.error) {
    throw result.error;
  }

  return {
    code: result.code,
    map: result.map,
  };
}

module.exports = minifier;
