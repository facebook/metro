/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const Generator = require('./Generator');
const SourceMap = require('source-map');

import type {BabelSourceMap} from '@babel/core';
import type {BabelSourceMapSegment} from '@babel/generator';

type GeneratedCodeMapping = [number, number];
type SourceMapping = [number, number, number, number];
type SourceMappingWithName = [number, number, number, number, string];

export type MetroSourceMapSegmentTuple =
  | SourceMappingWithName
  | SourceMapping
  | GeneratedCodeMapping;

type FBExtensions = {
  x_facebook_offsets: Array<number>,
  x_metro_module_paths: Array<string>,
};

export type IndexMapSection = {
  map: MetroSourceMap,
  offset: {line: number, column: number},
};

export type IndexMap = {
  file?: string,
  mappings?: void, // avoids SourceMap being a disjoint union
  sections: Array<IndexMapSection>,
  version: number,
};

export type FBIndexMap = IndexMap & FBExtensions;
export type MetroSourceMap = IndexMap | BabelSourceMap;
export type FBSourceMap = FBIndexMap | (BabelSourceMap & FBExtensions);

/**
 * Creates a source map from modules with "raw mappings", i.e. an array of
 * tuples with either 2, 4, or 5 elements:
 * generated line, generated column, source line, source line, symbol name.
 * Accepts an `offsetLines` argument in case modules' code is to be offset in
 * the resulting bundle, e.g. by some prefix code.
 */
function fromRawMappings(
  modules: $ReadOnlyArray<{
    +map: ?Array<MetroSourceMapSegmentTuple>,
    +path: string,
    +source: string,
    +code: string,
  }>,
  offsetLines: number = 0,
): Generator {
  const generator = new Generator();
  let carryOver = offsetLines;

  for (var j = 0, o = modules.length; j < o; ++j) {
    var module = modules[j];
    var {code, map} = module;

    if (Array.isArray(map)) {
      addMappingsForFile(generator, map, module, carryOver);
    } else if (map != null) {
      throw new Error(
        `Unexpected module with full source map found: ${module.path}`,
      );
    }

    carryOver = carryOver + countLines(code);
  }

  return generator;
}

/**
 * Transforms a standard source map object into a Raw Mappings object, to be
 * used across the bundler.
 */
function toBabelSegments(
  sourceMap: BabelSourceMap,
): Array<BabelSourceMapSegment> {
  const rawMappings = [];

  new SourceMap.SourceMapConsumer(sourceMap).eachMapping(map => {
    rawMappings.push({
      generated: {
        line: map.generatedLine,
        column: map.generatedColumn,
      },
      original: {
        line: map.originalLine,
        column: map.originalColumn,
      },
      source: map.source,
      name: map.name,
    });
  });

  return rawMappings;
}

function toSegmentTuple(
  mapping: BabelSourceMapSegment,
): MetroSourceMapSegmentTuple {
  const {column, line} = mapping.generated;
  const {name, original} = mapping;

  if (original == null) {
    return [line, column];
  }

  if (typeof name !== 'string') {
    return [line, column, original.line, original.column];
  }

  return [line, column, original.line, original.column, name];
}

function addMappingsForFile(generator, mappings, module, carryOver) {
  generator.startFile(module.path, module.source);

  for (let i = 0, n = mappings.length; i < n; ++i) {
    addMapping(generator, mappings[i], carryOver);
  }

  generator.endFile();
}

function addMapping(generator, mapping, carryOver) {
  const n = mapping.length;
  const line = mapping[0] + carryOver;
  // lines start at 1, columns start at 0
  const column = mapping[1];
  if (n === 2) {
    generator.addSimpleMapping(line, column);
  } else if (n === 4) {
    const sourceMap: SourceMapping = (mapping: any);

    generator.addSourceMapping(line, column, sourceMap[2], sourceMap[3]);
  } else if (n === 5) {
    const sourceMap: SourceMappingWithName = (mapping: any);

    generator.addNamedSourceMapping(
      line,
      column,
      sourceMap[2],
      sourceMap[3],
      sourceMap[4],
    );
  } else {
    throw new Error(`Invalid mapping: [${mapping.join(', ')}]`);
  }
}

function countLines(string) {
  return string.split('\n').length;
}

function createIndexMap(
  file: string,
  sections: Array<IndexMapSection>,
): IndexMap {
  return {
    version: 3,
    file,
    sections,
  };
}

module.exports = {
  createIndexMap,
  fromRawMappings,
  toBabelSegments,
  toSegmentTuple,
};
