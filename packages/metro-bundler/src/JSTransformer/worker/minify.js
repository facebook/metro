/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const uglify = require('uglify-js');

import type {MappingsMap} from '../../lib/SourceMap';
type ResultWithMap = {
  code: string,
  map: MappingsMap,
};

const UGLIFY_JS_OUTPUT_OPTIONS = {
  ascii_only: true,
  screw_ie8: true,
};

function noSourceMap(code: string): string {
  return minify(code).code;
}

function withSourceMap(
  code: string,
  sourceMap: ?MappingsMap,
  filename: string,
): ResultWithMap {
  const result = minify(code, sourceMap);

  const map: MappingsMap = JSON.parse(result.map);
  map.sources = [filename];
  return {code: result.code, map};
}

function minify(inputCode: string, inputMap: ?MappingsMap) {
  return uglify.minify(inputCode, {
    fromString: true,
    inSourceMap: inputMap,
    outSourceMap: true,
    output: UGLIFY_JS_OUTPUT_OPTIONS,
  });
}

module.exports = {
  noSourceMap,
  withSourceMap,
};
