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

import type {SourceMap as MappingsMap} from 'babel-core';
import type {RawMapping} from 'babel-generator';
import type {RawMapping as CompactRawMapping} from 'source-map';

export type IndexMapSection = {
  map: SourceMap,
  offset: {line: number, column: number},
};

export type RawMappings = Array<RawMapping>;

type FBExtensions = {
  x_facebook_offsets: Array<number>,
  x_metro_module_paths: Array<string>,
};

export type {MappingsMap};
export type IndexMap = {
  file?: string,
  mappings?: void, // avoids SourceMap being a disjoint union
  sections: Array<IndexMapSection>,
  version: number,
};

export type FBIndexMap = IndexMap & FBExtensions;
export type SourceMap = IndexMap | MappingsMap;
export type FBSourceMap = FBIndexMap | (MappingsMap & FBExtensions);

export type CompactRawMappings = Array<CompactRawMapping>;

function isMappingsMap(map: SourceMap): %checks {
  return map.mappings !== undefined;
}

exports.isMappingsMap = isMappingsMap;
