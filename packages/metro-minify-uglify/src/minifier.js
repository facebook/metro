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
  MetroMinifier,
  MetroMinifierResult,
  MinifyOptions,
} from 'metro/src/shared/types.flow.js';

function minifier(
  code: string,
  sourceMap: ?BabelSourceMap,
  filename: string,
  options?: MinifyOptions = {},
): MetroMinifierResult {
  const result = minify(code, sourceMap, options);

  if (!sourceMap) {
    return {code: result.code};
  }

  const map: BabelSourceMap = JSON.parse(result.map);

  map.sources = [filename];

  return {code: result.code, map};
}

function minify(
  inputCode: string,
  inputMap: ?BabelSourceMap,
  options: MinifyOptions,
) {
  const result = uglify.minify(inputCode, {
    mangle: {
      toplevel: false,
      reserved: options.reserved,
    },
    output: {
      ascii_only: true,
      quote_style: 3,
      wrap_iife: true,
    },
    sourceMap: {
      content: inputMap,
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

module.exports = (minifier: MetroMinifier);
