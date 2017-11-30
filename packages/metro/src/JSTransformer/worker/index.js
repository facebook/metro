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

const JsFileWrapping = require('../../ModuleGraph/worker/JsFileWrapping');

const collectDependencies = require('../../ModuleGraph/worker/collect-dependencies');
const constantFolding = require('./constant-folding');
const generate = require('babel-generator').default;
const inline = require('./inline');
const minify = require('./minify');

const {compactMapping} = require('../../Bundler/source-map');

import type {LogEntry} from '../../Logger/Types';
import type {CompactRawMappings, MappingsMap} from '../../lib/SourceMap';
import type {LocalPath} from '../../node-haste/lib/toLocalPath';
import type {ResultWithMap} from './minify';
import type {Ast, Plugins as BabelPlugins} from 'babel-core';

export type TransformedCode = {
  code: string,
  dependencies: $ReadOnlyArray<string>,
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
  ast: Ast,
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
  +inlineRequires: boolean,
  +minify: boolean,
  +platform: ?string,
  +projectRoot: string,
|};

export type TransformOptions = {
  +enableBabelRCLookup?: boolean,
  +dev?: boolean,
  +generateSourceMaps?: boolean,
  +hot?: boolean,
  +inlineRequires: boolean,
  +minify: boolean,
  +platform: ?string,
  +projectRoot: string,
};

export type Options = TransformOptionsStrict;

export type Data = {
  result: TransformedCode,
  transformFileStartLogEntry: LogEntry,
  transformFileEndLogEntry: LogEntry,
};

function postTransform(
  filename: string,
  localPath: LocalPath,
  sourceCode: string,
  isScript: boolean,
  options: Options,
  transformFileStartLogEntry: LogEntry,
  ast: Ast,
) {
  const timeDelta = process.hrtime(transformFileStartLogEntry.start_timestamp);
  const duration_ms = Math.round((timeDelta[0] * 1e9 + timeDelta[1]) / 1e6);
  const transformFileEndLogEntry = {
    action_name: 'Transforming file',
    action_phase: 'end',
    file_name: filename,
    duration_ms,
    log_entry_label: 'Transforming file',
  };

  let dependencies, wrappedAst;

  // If the module to transform is a script (meaning that is not part of the
  // dependency graph and it code will just be prepended to the bundle modules),
  // we need to wrap it differently than a commonJS module (also, scripts do
  // not have dependencies).
  if (isScript) {
    dependencies = [];
    wrappedAst = JsFileWrapping.wrapPolyfill(ast);
  } else {
    let dependencyData = collectDependencies(ast);

    if (!options.dev) {
      dependencyData = collectDependencies.forOptimization(
        ast,
        dependencyData.dependencies,
        dependencyData.dependencyMapName,
      );
    }

    dependencies = dependencyData.dependencies.map(dep => dep.name);
    wrappedAst = JsFileWrapping.wrapModule(
      ast,
      dependencyData.dependencyMapName,
    );
  }

  const result = generate(
    wrappedAst,
    {
      code: false,
      comments: false,
      compact: false,
      filename: localPath,
      retainLines: false,
      sourceFileName: filename,
      sourceMaps: true,
    },
    sourceCode,
  );

  const map = result.rawMappings ? result.rawMappings.map(compactMapping) : [];

  return {
    result: {dependencies, code: result.code, map},
    transformFileStartLogEntry,
    transformFileEndLogEntry,
  };
}

function transformCode(
  transformer: Transformer<*>,
  filename: string,
  localPath: LocalPath,
  sourceCode: string,
  isScript: boolean,
  options: Options,
): Data | Promise<Data> {
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

  const transformResult = transformer.transform({
    filename,
    localPath,
    options,
    plugins,
    src: sourceCode,
  });

  const postTransformArgs = [
    filename,
    localPath,
    sourceCode,
    isScript,
    options,
    transformFileStartLogEntry,
  ];

  return typeof transformResult.then === 'function'
    ? transformResult.then(({ast}) => postTransform(...postTransformArgs, ast))
    : postTransform(...postTransformArgs, transformResult.ast);
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

exports.transformAndExtractDependencies = function(
  transform: string,
  filename: string,
  localPath: LocalPath,
  sourceCode: string,
  isScript: boolean,
  options: Options,
): Data | Promise<Data> {
  // $FlowFixMe: impossible to type a dynamic require.
  const transformModule: Transformer<*> = require(transform);

  return transformCode(
    transformModule,
    filename,
    localPath,
    sourceCode,
    isScript,
    options,
  );
};

exports.transformCode = transformCode; // for easier testing
