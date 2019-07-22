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

const SourceMetadataMapConsumer = require('./SourceMetadataMapConsumer');

const fs = require('fs');

import type {MixedSourceMap} from 'metro-source-map';
// flowlint-next-line untyped-type-import:off
import {typeof SourceMapConsumer} from 'source-map';

type ModuleIds = {
  segmentId: number,
  localId: ?number,
};

type SymbolicationContext = {|
  +inputLineStart: number,
  +inputColumnStart: number,
  +outputLineStart: number,
  +outputColumnStart: number,
  +segments: {
    +[id: string]: {|
      +consumer: SourceMapConsumer,
      +moduleOffsets: $ReadOnlyArray<number>,
      +sourceFunctionsConsumer: ?SourceMetadataMapConsumer,
    |},
  },
|};

// TODO (T46584006): Write the real types for these.
// eslint-disable-next-line lint/no-unclear-flowtypes
type SizeAttributionMap = Object;
// eslint-disable-next-line lint/no-unclear-flowtypes
type ChromeTrace = Object;
// eslint-disable-next-line lint/no-unclear-flowtypes
type ChromeTraceEntry = Object;

const UNKNOWN_MODULE_IDS: ModuleIds = {
  segmentId: 0,
  localId: undefined,
};

/*
 * If the file name of a stack frame is numeric (+ ".js"), we assume it's a
 * lazily injected module coming from a "random access bundle". We are using
 * special source maps for these bundles, so that we can symbolicate stack
 * traces for multiple injected files with a single source map.
 *
 * There is also a convention for callsites that are in split segments of a
 * bundle, named either `seg-3.js` for segment #3 for example, or `seg-3_5.js`
 * for module #5 of segment #3 of a segmented RAM bundle.
 */
function parseFileName(str: string): ModuleIds {
  const modMatch = str.match(/^(\d+).js$/);
  if (modMatch != null) {
    return {segmentId: 0, localId: Number(modMatch[1])};
  }
  const segMatch = str.match(/^seg-(\d+)(?:_(\d+))?.js$/);
  if (segMatch != null) {
    return {
      segmentId: Number(segMatch[1]),
      localId: segMatch[2] ? Number(segMatch[2]) : null,
    };
  }
  return UNKNOWN_MODULE_IDS;
}

/*
 * A helper function to return a mapping {line, column} object for a given input
 * line and column, and optionally a module ID.
 */
function getOriginalPositionFor(
  lineNumber: ?number,
  columnNumber: ?number,
  moduleIds: ?ModuleIds,
  context: SymbolicationContext,
): {|
  line: ?number,
  column: ?number,
  source: ?string,
  name: ?string,
|} {
  const position = getOriginalPositionDetailsFor(
    lineNumber,
    columnNumber,
    moduleIds,
    context,
  );
  return {
    line: position.line,
    column: position.column,
    source: position.source,
    name: position.functionName ? position.functionName : position.name,
  };
}

/*
 * An internal helper function similar to getOriginalPositionFor. This one
 * returns both `name` and `functionName` fields so callers can distinguish the
 * source of the name.
 */
function getOriginalPositionDetailsFor(
  lineNumber: ?number,
  columnNumber: ?number,
  moduleIds: ?ModuleIds,
  context: SymbolicationContext,
): {|
  line: ?number,
  column: ?number,
  source: ?string,
  name: ?string,
  functionName: ?string,
|} {
  // Adjust arguments to source-map's input coordinates
  lineNumber =
    lineNumber != null ? lineNumber - context.inputLineStart + 1 : lineNumber;
  columnNumber =
    columnNumber != null
      ? columnNumber - context.inputColumnStart + 0
      : columnNumber;

  if (!moduleIds) {
    moduleIds = UNKNOWN_MODULE_IDS;
  }

  var moduleLineOffset = 0;
  var metadata = context.segments[moduleIds.segmentId + ''];
  const {localId} = moduleIds;
  if (localId != null) {
    const {moduleOffsets} = metadata;
    if (!moduleOffsets) {
      throw new Error(
        'Module ID given for a source map that does not have ' +
          'an x_facebook_offsets field',
      );
    }
    if (moduleOffsets[localId] == null) {
      throw new Error('Unknown module ID: ' + localId);
    }
    moduleLineOffset = moduleOffsets[localId];
  }
  const original = metadata.consumer.originalPositionFor({
    line: Number(lineNumber) + moduleLineOffset,
    column: Number(columnNumber),
  });
  if (metadata.sourceFunctionsConsumer) {
    original.functionName =
      metadata.sourceFunctionsConsumer.functionNameFor(original) || null;
  } else {
    original.functionName = null;
  }
  return {
    ...original,
    line:
      original.line != null
        ? original.line - 1 + context.outputLineStart
        : original.line,
    column:
      original.column != null
        ? original.column - 0 + context.outputColumnStart
        : original.column,
  };
}

function createContext(
  SourceMapConsumer: SourceMapConsumer,
  sourceMapContent: string | MixedSourceMap,
  options: {
    nameSource?: 'function_names' | 'identifier_names',
    inputLineStart?: number,
    inputColumnStart?: number,
    outputLineStart?: number,
    outputColumnStart?: number,
  } = {},
): SymbolicationContext {
  const context = {
    inputLineStart: 1,
    inputColumnStart: 0,
    outputLineStart: 1,
    outputColumnStart: 0,
  };
  if (options) {
    for (const option of [
      'inputLineStart',
      'inputColumnStart',
      'outputLineStart',
      'outputColumnStart',
    ]) {
      if (options[option] != null) {
        context[option] = options[option];
      }
    }
  }
  const useFunctionNames =
    !options ||
    !('nameSource' in options) ||
    !options.nameSource ||
    options.nameSource === 'function_names';
  const sourceMapJson: MixedSourceMap =
    typeof sourceMapContent === 'string'
      ? JSON.parse(sourceMapContent.replace(/^\)\]\}'/, ''))
      : sourceMapContent;
  const segments = {
    '0': {
      consumer: new SourceMapConsumer(sourceMapJson),
      moduleOffsets: sourceMapJson.x_facebook_offsets || [],
      sourceFunctionsConsumer: useFunctionNames
        ? new SourceMetadataMapConsumer(sourceMapJson)
        : null,
    },
  };
  if (sourceMapJson.x_facebook_segments) {
    for (const key of Object.keys(sourceMapJson.x_facebook_segments)) {
      const map = sourceMapJson.x_facebook_segments[key];
      segments[key] = {
        consumer: new SourceMapConsumer(map),
        moduleOffsets: map.x_facebook_offsets || [],
        sourceFunctionsConsumer: useFunctionNames
          ? new SourceMetadataMapConsumer(map)
          : null,
      };
    }
  }
  return {
    ...context,
    segments,
  };
}

// parse stack trace with String.replace
// replace the matched part of stack trace to symbolicated result
// sample stack trace:
//  IOS: foo@4:18131, Android: bar:4:18063
// sample stack trace with module id:
//  IOS: foo@123.js:4:18131, Android: bar:123.js:4:18063
// sample stack trace without function name:
//  123.js:4:18131
// sample result:
//  IOS: foo.js:57:foo, Android: bar.js:75:bar
function symbolicate(
  stackTrace: string,
  context: SymbolicationContext,
): string {
  return stackTrace.replace(
    /(?:([^@: \n(]+)(@|:))?(?:(?:([^@: \n(]+):)?(\d+):(\d+)|\[native code\])/g,
    function(match, func, delimiter, fileName, line, column) {
      if (delimiter === ':' && func && !fileName) {
        fileName = func;
        func = null;
      }
      var original = getOriginalPositionFor(
        line,
        column,
        parseFileName(fileName || ''),
        context,
      );
      return (
        (original.source ?? 'null') +
        ':' +
        (original.line ?? 'null') +
        ':' +
        (original.name ?? 'null')
      );
    },
  );
}

// Taking in a map like
// trampoline offset (optional js function name)
// JS_0158_xxxxxxxxxxxxxxxxxxxxxx fe 91081
// JS_0159_xxxxxxxxxxxxxxxxxxxxxx Ft 68651
// JS_0160_xxxxxxxxxxxxxxxxxxxxxx value 50700
// JS_0161_xxxxxxxxxxxxxxxxxxxxxx setGapAtCursor 0
// JS_0162_xxxxxxxxxxxxxxxxxxxxxx (unknown) 50818
// JS_0163_xxxxxxxxxxxxxxxxxxxxxx value 108267

function symbolicateProfilerMap(
  mapFile: string,
  context: SymbolicationContext,
): string {
  return fs
    .readFileSync(mapFile, 'utf8')
    .split('\n')
    .slice(0, -1)
    .map(function(line) {
      const line_list = line.split(' ');
      const trampoline = line_list[0];
      const js_name = line_list[1];
      const offset = parseInt(line_list[2], 10);

      if (!offset) {
        return trampoline + ' ' + trampoline;
      }

      var original = getOriginalPositionFor(
        context.inputLineStart,
        offset,
        UNKNOWN_MODULE_IDS,
        context,
      );

      return (
        trampoline +
        ' ' +
        (original.name || js_name) +
        '::' +
        [original.source, original.line, original.column].join(':')
      );
    })
    .join('\n');
}

function symbolicateAttribution(
  obj: SizeAttributionMap,
  context: SymbolicationContext,
): SizeAttributionMap {
  var loc = obj.location;
  var line = loc.line != null ? loc.line : context.inputLineStart;
  var column = loc.column != null ? loc.column : loc.virtualOffset;
  var file = loc.filename ? parseFileName(loc.filename) : UNKNOWN_MODULE_IDS;
  var original = getOriginalPositionFor(line, column, file, context);

  const isBytecodeRange =
    loc.bytecodeSize != null &&
    loc.virtualOffset != null &&
    !loc.column != null;

  // Functions compiled from Metro-bundled modules will often have a little bit
  // of unmapped wrapper code right at the beginning - which is where we query.
  // Let's attribute them to where the inner module code originates instead.
  // This loop is O(n*log(n)) in the size of the function, but we will generally
  // either:
  // 1. Find a non-null mapping within one or two iterations; or
  // 2. Reach the end of the function without encountering mappings - this might
  //    happen for function bodies that never throw (generally very short).
  while (
    isBytecodeRange &&
    original.source == null &&
    ++column < loc.virtualOffset + loc.bytecodeSize
  ) {
    original = getOriginalPositionFor(line, column, file, context);
  }

  obj.location = {
    file: original.source,
    line: original.line,
    column: original.column,
  };
}

// Symbolicate chrome trace "stackFrames" section.
// Each frame in it has three fields: name, funcVirtAddr(optional), offset(optional).
// funcVirtAddr and offset are only available if trace is generated from
// hbc bundle without debug info.
function symbolicateChromeTrace(
  traceFile: string,
  {stdout, stderr}: {stdout: stream$Writable, stderr: stream$Writable},
  context: SymbolicationContext,
): void {
  const contentJson: ChromeTrace = JSON.parse(
    fs.readFileSync(traceFile, 'utf8'),
  );
  if (contentJson.stackFrames == null) {
    throw new Error('Unable to locate `stackFrames` section in trace.');
  }
  stdout.write(
    'Processing ' + Object.keys(contentJson.stackFrames).length + ' frames\n',
  );
  Object.values(contentJson.stackFrames).forEach(function(
    entry: ChromeTraceEntry,
  ) {
    let line;
    let column;

    // Function entrypoint line/column; used for symbolicating function name
    // with legacy source maps (or when --no-function-names is set).
    let funcLine;
    let funcColumn;

    if (entry.funcVirtAddr != null && entry.offset != null) {
      // Without debug information.
      const funcVirtAddr = parseInt(entry.funcVirtAddr, 10);
      const offsetInFunction = parseInt(entry.offset, 10);
      // Main bundle always use hard-coded line value 1.
      // TODO: support multiple bundle/module.
      line = context.inputLineStart;
      column = funcVirtAddr + offsetInFunction;
      funcLine = context.inputLineStart;
      funcColumn = funcVirtAddr;
    } else if (entry.line != null && entry.column != null) {
      // For hbc bundle with debug info, name field may already have source
      // information for the bundle; we still can use babel/metro/prepack
      // source map to symbolicate the bundle frame addresses further to its
      // original source code.
      line = entry.line;
      column = entry.column;

      funcLine = entry.funcLine;
      funcColumn = entry.funcColumn;
    } else {
      // Native frames.
      return;
    }

    // Symbolicate original file/line/column.
    const addressOriginal = getOriginalPositionDetailsFor(
      line,
      column,
      UNKNOWN_MODULE_IDS,
      context,
    );

    let frameName;
    if (addressOriginal.functionName) {
      frameName = addressOriginal.functionName;
    } else {
      frameName = entry.name;
      // Symbolicate function name.
      if (funcLine != null && funcColumn != null) {
        const funcOriginal = getOriginalPositionFor(
          funcLine,
          funcColumn,
          UNKNOWN_MODULE_IDS,
          context,
        );
        if (funcOriginal.name != null) {
          frameName = funcOriginal.name;
        }
      } else {
        // No function line/column info.
        (stderr || stdout).write(
          'Warning: no function prolog line/column info; name may be wrong\n',
        );
      }
    }

    // Output format is: funcName(file:line:column)
    entry.name = [
      frameName,
      '(',
      [
        addressOriginal.source ?? 'null',
        addressOriginal.line ?? 'null',
        addressOriginal.column ?? 'null',
      ].join(':'),
      ')',
    ].join('');
  });
  stdout.write('Writing to ' + traceFile + '\n');
  fs.writeFileSync(traceFile, JSON.stringify(contentJson));
}

module.exports = {
  createContext,
  getOriginalPositionFor,
  parseFileName,
  symbolicate,
  symbolicateProfilerMap,
  symbolicateAttribution,
  symbolicateChromeTrace,
  SourceMetadataMapConsumer,
};
