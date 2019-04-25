/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

/* eslint-disable no-console */

const SourceMetadataMapConsumer = require('./SourceMetadataMapConsumer');

const fs = require('fs');

const UNKNOWN_MODULE_IDS = {
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
function parseFileName(str) {
  const modMatch = str.match(/^(\d+).js$/);
  if (modMatch != null) {
    return {segmentId: 0, localId: Number(modMatch[1])};
  }
  const segMatch = str.match(/^seg-(\d+)(?:_(\d+))?.js$/);
  if (segMatch != null) {
    return {
      segmentId: Number(segMatch[1]),
      localId: segMatch[2] && Number(segMatch[2]),
    };
  }
  return UNKNOWN_MODULE_IDS;
}

/*
 * A helper function to return a mapping {line, column} object for a given input
 * line and column, and optionally a module ID.
 */
function getOriginalPositionFor(lineNumber, columnNumber, moduleIds, context) {
  var moduleLineOffset = 0;
  var metadata = context.segments[moduleIds.segmentId];
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
    const functionName = metadata.sourceFunctionsConsumer.functionNameFor(
      original,
    );
    if (functionName) {
      return {...original, name: functionName};
    }
  }
  return original;
}

function createContext(
  SourceMapConsumer,
  sourceMapContent,
  options /*: {nameSource?: 'function_names' | 'identifier_names'} */ = {},
) {
  const useFunctionNames =
    !options ||
    !('nameSource' in options) ||
    !options.nameSource ||
    options.nameSource === 'function_names';
  var sourceMapJson = JSON.parse(sourceMapContent.replace(/^\)\]\}'/, ''));
  return {
    segments: Object.entries(sourceMapJson.x_facebook_segments || {}).reduce(
      (acc, [key, map]) => {
        acc[key] = {
          consumer: new SourceMapConsumer(map),
          moduleOffsets: map.x_facebook_offsets || {},
          sourceFunctionsConsumer: useFunctionNames
            ? new SourceMetadataMapConsumer(map)
            : null,
        };
        return acc;
      },
      {
        '0': {
          consumer: new SourceMapConsumer(sourceMapJson),
          moduleOffsets: sourceMapJson.x_facebook_offsets || {},
          sourceFunctionsConsumer: useFunctionNames
            ? new SourceMetadataMapConsumer(sourceMapJson)
            : null,
        },
      },
    ),
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
function symbolicate(stackTrace, context) {
  return stackTrace.replace(
    /(?:([^@: \n]+)(@|:))?(?:(?:([^@: \n]+):)?(\d+):(\d+)|\[native code\])/g,
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
      return original.source + ':' + original.line + ':' + original.name;
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

function symbolicateProfilerMap(mapFile, context) {
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
        1,
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

function symbolicateAttribution(obj, context) {
  var loc = obj.location;
  var line = loc.line || 1;
  var column = loc.column || loc.virtualOffset;
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
function symbolicateChromeTrace(traceFile, context) {
  const contentJson = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
  if (contentJson.stackFrames == null) {
    console.error('Unable to locate `stackFrames` section in trace.');
    process.exit(1);
  }
  console.log(
    'Processing ' + Object.keys(contentJson.stackFrames).length + ' frames',
  );
  Object.values(contentJson.stackFrames).forEach(function(entry) {
    let line;
    let column;

    // Function entrypoint line/column; used for symbolicating function name.
    let funcLine;
    let funcColumn;

    if (entry.funcVirtAddr != null && entry.offset != null) {
      // Without debug information.
      const funcVirtAddr = parseInt(entry.funcVirtAddr, 10);
      const offsetInFunction = parseInt(entry.offset, 10);
      // Main bundle always use hard-coded line value 1.
      // TODO: support multiple bundle/module.
      line = 1;
      column = funcVirtAddr + offsetInFunction;
      funcLine = 1;
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
    const addressOriginal = getOriginalPositionFor(
      line,
      column,
      UNKNOWN_MODULE_IDS,
      context,
    );

    let frameName = entry.name;
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
      console.warn(
        'Warning: no function prolog line/column info; name may be wrong',
      );
    }

    // Output format is: funcName(file:line:column)
    const sourceLocation = `(${addressOriginal.source}:${
      addressOriginal.line
    }:${addressOriginal.column})`;
    entry.name = frameName + sourceLocation;
  });
  console.log('Writing to ' + traceFile);
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
