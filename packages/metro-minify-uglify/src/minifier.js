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

import type {
  MetroMinifier,
  ResultWithMap,
  ResultWithoutMap,
  MinifyOptions,
} from './types.js.flow';
import type {BabelSourceMap} from '@babel/core';

function noSourceMap(
  code: string,
  options?: MinifyOptions = {},
): ResultWithoutMap {
  return minify(code, undefined, options).code;
}

function withSourceMap(
  code: string,
  sourceMap: ?BabelSourceMap,
  filename: string,
  options?: MinifyOptions = {},
): ResultWithMap {
  const result = minify(code, sourceMap, options);
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

const metroMinifier: MetroMinifier = {
  noSourceMap,
  withSourceMap,
};

module.exports = metroMinifier;
