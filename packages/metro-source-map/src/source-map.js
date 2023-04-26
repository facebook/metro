/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

'use strict';

import type {IConsumer} from './Consumer/types.flow';
import type {BabelSourceMapSegment} from '@babel/generator';

const {BundleBuilder, createIndexMap} = require('./BundleBuilder');
const composeSourceMaps = require('./composeSourceMaps');
const Consumer = require('./Consumer');
// We need to export this for `metro-symbolicate`
const normalizeSourcePath = require('./Consumer/normalizeSourcePath');
const {generateFunctionMap} = require('./generateFunctionMap');
const Generator = require('./Generator');
// $FlowFixMe[untyped-import] - source-map
const SourceMap = require('source-map');

export type {IConsumer};

type GeneratedCodeMapping = [number, number];
type SourceMapping = [number, number, number, number];
type SourceMappingWithName = [number, number, number, number, string];

export type MetroSourceMapSegmentTuple =
  | SourceMappingWithName
  | SourceMapping
  | GeneratedCodeMapping;

export type HermesFunctionOffsets = {[number]: $ReadOnlyArray<number>, ...};

export type FBSourcesArray = $ReadOnlyArray<?FBSourceMetadata>;
export type FBSourceMetadata = [?FBSourceFunctionMap];
export type FBSourceFunctionMap = {
  +names: $ReadOnlyArray<string>,
  +mappings: string,
};

export type FBSegmentMap = {[id: string]: MixedSourceMap, ...};

export type BasicSourceMap = {
  +file?: string,
  +mappings: string,
  +names: Array<string>,
  +sourceRoot?: string,
  +sources: Array<string>,
  +sourcesContent?: Array<?string>,
  +version: number,
  +x_facebook_offsets?: Array<number>,
  +x_metro_module_paths?: Array<string>,
  +x_facebook_sources?: FBSourcesArray,
  +x_facebook_segments?: FBSegmentMap,
  +x_hermes_function_offsets?: HermesFunctionOffsets,
  +x_google_ignoreList?: Array<number>,
};

export type IndexMapSection = {
  map: IndexMap | BasicSourceMap,
  offset: {
    line: number,
    column: number,
    ...
  },
  ...
};

export type IndexMap = {
  +file?: string,
  +mappings?: void, // avoids SourceMap being a disjoint union
  +sourcesContent?: void,
  +sections: Array<IndexMapSection>,
  +version: number,
  +x_facebook_offsets?: Array<number>,
  +x_metro_module_paths?: Array<string>,
  +x_facebook_sources?: void,
  +x_facebook_segments?: FBSegmentMap,
  +x_hermes_function_offsets?: HermesFunctionOffsets,
  +x_google_ignoreList?: void,
};

export type MixedSourceMap = IndexMap | BasicSourceMap;

type SourceMapConsumerMapping = {
  generatedLine: number,
  generatedColumn: number,
  originalLine: ?number,
  originalColumn: ?number,
  source: ?string,
  name: ?string,
};

function fromRawMappingsImpl(
  isBlocking: boolean,
  onDone: Generator => void,
  modules: $ReadOnlyArray<{
    +map: ?Array<MetroSourceMapSegmentTuple>,
    +functionMap: ?FBSourceFunctionMap,
    +path: string,
    +source: string,
    +code: string,
    +isIgnored: boolean,
    +lineCount?: number,
  }>,
  offsetLines: number,
): void {
  const modulesToProcess = modules.slice();
  const generator = new Generator();
  let carryOver = offsetLines;

  function processNextModule() {
    if (modulesToProcess.length === 0) {
      return true;
    }

    const mod = modulesToProcess.shift();
    const {code, map} = mod;
    if (Array.isArray(map)) {
      addMappingsForFile(generator, map, mod, carryOver);
    } else if (map != null) {
      throw new Error(
        `Unexpected module with full source map found: ${mod.path}`,
      );
    }
    carryOver = carryOver + countLines(code);
    return false;
  }

  function workLoop() {
    const time = process.hrtime();
    while (true) {
      const isDone = processNextModule();
      if (isDone) {
        onDone(generator);
        break;
      }
      if (!isBlocking) {
        // Keep the loop running but try to avoid blocking
        // for too long because this is not in a worker yet.
        const diff = process.hrtime(time);
        const NS_IN_MS = 1000000;
        if (diff[1] > 50 * NS_IN_MS) {
          // We've blocked for more than 50ms.
          // This code currently runs on the main thread,
          // so let's give Metro an opportunity to handle requests.
          setImmediate(workLoop);
          break;
        }
      }
    }
  }

  workLoop();
}

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
    +functionMap: ?FBSourceFunctionMap,
    +path: string,
    +source: string,
    +code: string,
    +isIgnored: boolean,
    +lineCount?: number,
  }>,
  offsetLines: number = 0,
): Generator {
  let generator: void | Generator;
  fromRawMappingsImpl(
    true,
    g => {
      generator = g;
    },
    modules,
    offsetLines,
  );
  if (generator == null) {
    throw new Error('Expected fromRawMappingsImpl() to finish synchronously.');
  }
  return generator;
}

async function fromRawMappingsNonBlocking(
  modules: $ReadOnlyArray<{
    +map: ?Array<MetroSourceMapSegmentTuple>,
    +functionMap: ?FBSourceFunctionMap,
    +path: string,
    +source: string,
    +code: string,
    +isIgnored: boolean,
    +lineCount?: number,
  }>,
  offsetLines: number = 0,
): Promise<Generator> {
  return new Promise(resolve => {
    fromRawMappingsImpl(false, resolve, modules, offsetLines);
  });
}

/**
 * Transforms a standard source map object into a Raw Mappings object, to be
 * used across the bundler.
 */
function toBabelSegments(
  sourceMap: BasicSourceMap,
): Array<BabelSourceMapSegment> {
  const rawMappings: Array<BabelSourceMapSegment> = [];

  new SourceMap.SourceMapConsumer(sourceMap).eachMapping(
    (map: SourceMapConsumerMapping) => {
      rawMappings.push(
        map.originalLine == null || map.originalColumn == null
          ? {
              generated: {
                line: map.generatedLine,
                column: map.generatedColumn,
              },
              source: map.source,
              name: map.name,
            }
          : {
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
            },
      );
    },
  );

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

function addMappingsForFile(
  generator: Generator,
  mappings: Array<MetroSourceMapSegmentTuple>,
  module: {
    +code: string,
    +functionMap: ?FBSourceFunctionMap,
    +map: ?Array<MetroSourceMapSegmentTuple>,
    +path: string,
    +source: string,
    +isIgnored: boolean,
    +lineCount?: number,
  },
  carryOver: number,
) {
  generator.startFile(module.path, module.source, module.functionMap, {
    addToIgnoreList: module.isIgnored,
  });

  for (let i = 0, n = mappings.length; i < n; ++i) {
    addMapping(generator, mappings[i], carryOver);
  }

  generator.endFile();
}

function addMapping(
  generator: Generator,
  mapping: MetroSourceMapSegmentTuple,
  carryOver: number,
) {
  const n = mapping.length;
  const line = mapping[0] + carryOver;
  // lines start at 1, columns start at 0
  const column = mapping[1];
  if (n === 2) {
    generator.addSimpleMapping(line, column);
  } else if (n === 4) {
    // $FlowIssue[invalid-tuple-arity] Arity is ensured by conidition on length
    const sourceMap: SourceMapping = mapping;

    generator.addSourceMapping(line, column, sourceMap[2], sourceMap[3]);
  } else if (n === 5) {
    // $FlowIssue[invalid-tuple-arity] Arity is ensured by conidition on length
    const sourceMap: SourceMappingWithName = mapping;

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

const newline = /\r\n?|\n|\u2028|\u2029/g;

const countLines = (string: string): number =>
  (string.match(newline) || []).length + 1;

module.exports = {
  BundleBuilder,
  composeSourceMaps,
  Consumer,
  createIndexMap,
  generateFunctionMap,
  fromRawMappings,
  fromRawMappingsNonBlocking,
  normalizeSourcePath,
  toBabelSegments,
  toSegmentTuple,
};
