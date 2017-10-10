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

const asyncify = require('async/asyncify');
const constantFolding = require('./constant-folding');
const extractDependencies = require('./extract-dependencies');
const inline = require('./inline');
const invariant = require('fbjs/lib/invariant');
const minify = require('./minify');

import type {LogEntry} from '../../Logger/Types';
import type {MappingsMap} from '../../lib/SourceMap';
import type {LocalPath} from '../../node-haste/lib/toLocalPath';
import type {Ast, Plugins as BabelPlugins} from 'babel-core';

export type TransformedCode = {
  code: string,
  dependencies: Array<string>,
  dependencyOffsets: Array<number>,
  map?: ?MappingsMap,
};

export type Transformer<ExtraOptions: {} = {}> = {
  transform: ({|
    filename: string,
    localPath: string,
    options: ExtraOptions & TransformOptions,
    plugins?: BabelPlugins,
    src: string,
  |}) => {ast: ?Ast, code: string, map: ?MappingsMap},
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

type Callback<T> = (error: ?Error, data: ?T) => mixed;
type TransformCode = (
  Transformer<*>,
  string,
  LocalPath,
  string,
  Options,
  Callback<Data>,
) => void;

const transformCode: TransformCode = asyncify(
  (
    transformer: Transformer<*>,
    filename: string,
    localPath: LocalPath,
    sourceCode: string,
    options: Options,
  ): Data => {
    invariant(
      !options.minify || options.transform.generateSourceMaps,
      'Minifying source code requires the `generateSourceMaps` option to be `true`',
    );

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

    const transformed = transformer.transform({
      filename,
      localPath,
      options: options.transform,
      src: sourceCode,
    });

    invariant(
      transformed != null,
      'Missing transform results despite having no error.',
    );

    var code, map;
    if (options.minify) {
      ({code, map} = constantFolding(
        filename,
        inline(filename, transformed, options),
      ));
      invariant(code != null, 'Missing code from constant-folding transform.');
    } else {
      ({code, map} = transformed);
    }

    if (isJson) {
      code = code.replace(/^\w+\.exports=/, '');
    } else {
      // Remove shebang
      code = code.replace(/^#!.*/, '');
    }

    const depsResult = isJson
      ? {dependencies: [], dependencyOffsets: []}
      : extractDependencies(code, filename);

    const timeDelta = process.hrtime(
      transformFileStartLogEntry.start_timestamp,
    );
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
  },
);

exports.transformAndExtractDependencies = (
  transform: string,
  filename: string,
  localPath: LocalPath,
  sourceCode: string,
  options: Options,
  callback: Callback<Data>,
) => {
  /* $FlowFixMe: impossible to type a dynamic require */
  const transformModule: Transformer<*> = require(transform);
  transformCode(
    transformModule,
    filename,
    localPath,
    sourceCode,
    options,
    callback,
  );
};

exports.minify = asyncify(
  (filename: string, code: string, sourceMap: MappingsMap) => {
    var result;
    try {
      result = minify.withSourceMap(code, sourceMap, filename);
    } catch (error) {
      if (error.constructor.name === 'JS_Parse_Error') {
        throw new Error(
          error.message +
            ' in file "' +
            filename +
            '" at line ' +
            error.line +
            ':' +
            error.col,
        );
      }
      throw error;
    }
    return result;
  },
);

exports.transformCode = transformCode; // for easier testing
