/**
 * Copyright (c) 2015-present, Facebook, Inc.
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

const path = require('path');

import type {MetroSourceMap} from 'metro-source-map';

function relativizeSourceMapInternal(
  sourceMap: MetroSourceMap,
  sourcesRoot: string,
) {
  if (sourceMap.mappings === undefined) {
    for (let i = 0; i < sourceMap.sections.length; i++) {
      relativizeSourceMapInternal(sourceMap.sections[i].map, sourcesRoot);
    }
  } else {
    for (let i = 0; i < sourceMap.sources.length; i++) {
      sourceMap.sources[i] = path.relative(sourcesRoot, sourceMap.sources[i]);
    }
  }
}

function relativizeSourceMap(
  sourceMap: MetroSourceMap,
  sourcesRoot?: string,
): MetroSourceMap {
  if (!sourcesRoot) {
    return sourceMap;
  }
  relativizeSourceMapInternal(sourceMap, sourcesRoot);
  return sourceMap;
}

module.exports = relativizeSourceMap;
