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

import type {
  MetroMinifier,
  MinifyOptions,
  ResultWithMap,
  ResultWithoutMap,
} from './types';
import type {BabelSourceMap} from '@babel/core';

const minifier = require('metro-minify-uglify/minifier');
const terser = require('terser');

export type {MetroMinifier} from './types.js.flow';
export type {ResultWithMap} from './types.js.flow';
export type {ResultWithoutMap} from './types.js.flow';

function noSourceMap(
  code: string,
  options?: MinifyOptions = {},
): ResultWithoutMap {
  return minifier.noSourceMap(code, options, terser);
}

function withSourceMap(
  code: string,
  sourceMap: ?BabelSourceMap,
  filename: string,
  options?: MinifyOptions = {},
): ResultWithMap {
  return minifier.withSourceMap(code, sourceMap, filename, options, terser);
}

const metroMinifier: MetroMinifier = {
  noSourceMap,
  withSourceMap,
};

module.exports = metroMinifier;
