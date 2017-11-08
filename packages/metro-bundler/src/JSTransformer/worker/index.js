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

const constantFolding = require('./constant-folding');
const extractDependencies = require('./extract-dependencies');
const inline = require('./inline');
const minify = require('./minify');

const {compactMapping, toRawMappings} = require('../../Bundler/source-map');

import type {LogEntry} from '../../Logger/Types';
import type {
  CompactRawMappings,
  MappingsMap,
  RawMappings,
} from '../../lib/SourceMap';
import type {LocalPath} from '../../node-haste/lib/toLocalPath';
import type {ResultWithMap} from './minify';
import type {Ast, Plugins as BabelPlugins} from 'babel-core';

export type TransformedCode = {
  code: string,
  dependencies: Array<string>,
  dependencyOffsets: Array<number>,
  map: CompactRawMappings,
};

export type TransformArgs<ExtraOptions: {}> = {|
  filename: string,
  localPath: string,
  options: ExtraOptions & TransformOptions,
  plugins?: BabelPlugins,
  src: string,
|};

export type TransformResults = {
  ast: ?Ast,
  code: string,
  map: ?MappingsMap | RawMappings,
};

export type Transform<ExtraOptions: {}> = (
  TransformArgs<ExtraOptions>,
) => TransformResults;

export type Transformer<ExtraOptions: {} = {}> = {
  transform: Transform<ExtraOptions>,
  getCacheKey: () => string,
};

export type TransformOptionsStrict = {|
  +enableBabelRCLookup: boolean,
  +dev: boolean,
  +generateSourceMaps: boolean,
  +hot: boolean,
  +inlineRequires: {+blacklist: {[string]: true}} | boolean,
  +platform: ?string,
  +projectRoot: string,
|};

export type TransformOptions = {
  +enableBabelRCLookup?: boolean,
  +dev?: boolean,
  +generateSourceMaps?: boolean,
  +hot?: boolean,
  +inlineRequires?: {+blacklist: {[string]: true}} | boolean,
  +platform: ?string,
  +projectRoot: string,
};

export type Options = {|
  +dev: boolean,
  +minify: boolean,
  +platform: ?string,
  +transform: TransformOptionsStrict,
|};

export type Data = {
  result: TransformedCode,
  transformFileStartLogEntry: LogEntry,
  transformFileEndLogEntry: LogEntry,
};

function transformCode(
  transformer: Transformer<*>,
  filename: string,
  localPath: LocalPath,
  sourceCode: string,
  options: Options,
): Data {
  const isJson = filename.endsWith('.json');

  if (isJson) {
    sourceCode = 'module.exports=' + sourceCode;
  }

  const transformFileStartLogEntry = {
    action_name: 'Transforming file',
    action_phase: 'start',
    file_name: filename,
    log_entry_label: 'Transforming file',
    start_timestamp: process.hrtime(),
  };

  const plugins = options.dev
    ? []
    : [[inline.plugin, options], [constantFolding.plugin, options]];

  const transformed = transformer.transform({
    filename,
    localPath,
    options: options.transform,
    plugins,
    src: sourceCode,
  });

  // If the transformer returns standard sourcemaps, we need to transform them
  // to rawMappings so we can process them correctly.
  const rawMappings =
    transformed.map && !Array.isArray(transformed.map)
      ? toRawMappings(transformed.map)
      : transformed.map;

  // Convert the sourcemaps to Compact Raw source maps.
  const map = rawMappings ? rawMappings.map(compactMapping) : [];

  let code = transformed.code;
  if (isJson) {
    code = code.replace(/^\w+\.exports=/, '');
  } else {
    // Remove shebang
    code = code.replace(/^#!.*/, '');
  }

  const depsResult = isJson
    ? {dependencies: [], dependencyOffsets: []}
    : extractDependencies(code, filename);

  const timeDelta = process.hrtime(transformFileStartLogEntry.start_timestamp);
  const duration_ms = Math.round((timeDelta[0] * 1e9 + timeDelta[1]) / 1e6);
  const transformFileEndLogEntry = {
    action_name: 'Transforming file',
    action_phase: 'end',
    file_name: filename,
    duration_ms,
    log_entry_label: 'Transforming file',
  };

  return {
    result: {...depsResult, code, map},
    transformFileStartLogEntry,
    transformFileEndLogEntry,
  };
}

exports.minify = async function(
  filename: string,
  code: string,
  sourceMap: MappingsMap,
): Promise<ResultWithMap> {
  try {
    return minify.withSourceMap(code, sourceMap, filename);
  } catch (error) {
    if (error.constructor.name === 'JS_Parse_Error') {
      throw new Error(
        `${error.message} in file ${filename} at ${error.line}:${error.col}`,
      );
    }

    throw error;
  }
};

exports.transformAndExtractDependencies = async function(
  transform: string,
  filename: string,
  localPath: LocalPath,
  sourceCode: string,
  options: Options,
): Promise<Data> {
  // $FlowFixMe: impossible to type a dynamic require.
  const transformModule: Transformer<*> = require(transform);

  return transformCode(
    transformModule,
    filename,
    localPath,
    sourceCode,
    options,
  );
};

exports.transformCode = transformCode; // for easier testing
