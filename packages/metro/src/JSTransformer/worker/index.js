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

const assetTransformer = require('../../assetTransformer');
const babylon = require('babylon');
const collectDependencies = require('../../ModuleGraph/worker/collectDependencies');
const constantFolding = require('./constant-folding');
const generate = require('babel-generator').default;
const inline = require('./inline');
const minify = require('./minify');
const optimizeDependencies = require('../../ModuleGraph/worker/optimizeDependencies');
const path = require('path');

const {toSegmentTuple} = require('metro-source-map');

import type {LogEntry} from 'metro-core/src/Logger';
import type {BabelSourceMap} from 'babel-core';
import type {MetroSourceMapSegmentTuple} from 'metro-source-map';
import type {LocalPath} from '../../node-haste/lib/toLocalPath';
import type {ResultWithMap} from './minify';
import type {Ast, Plugins as BabelPlugins} from 'babel-core';
import type {DynamicRequiresBehavior} from '../../ModuleGraph/worker/collectDependencies';

export type TransformedCode = {
  code: string,
  dependencies: $ReadOnlyArray<string>,
  map: Array<MetroSourceMapSegmentTuple>,
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
  +assetDataPlugins: $ReadOnlyArray<string>,
  +enableBabelRCLookup: boolean,
  +dev: boolean,
  +hot: boolean,
  +inlineRequires: boolean,
  +minify: boolean,
  +platform: ?string,
  +projectRoot: string,
|};

export type TransformOptions = {
  +assetDataPlugins: $ReadOnlyArray<string>,
  +enableBabelRCLookup?: boolean,
  +dev?: boolean,
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
  dynamicDepsInPackages: DynamicRequiresBehavior,
  receivedAst: ?Ast,
): Data {
  // Transformers can ouptut null ASTs (if they ignore the file). In that case
  // we need to parse the module source code to get their AST.
  const ast = receivedAst || babylon.parse(sourceCode, {sourceType: 'module'});

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
    let dependencyMapName;
    try {
      const opts = {
        dynamicRequires: getDynamicDepsBehavior(
          dynamicDepsInPackages,
          filename,
        ),
      };
      ({dependencies, dependencyMapName} = collectDependencies(ast, opts));
    } catch (error) {
      if (error instanceof collectDependencies.InvalidRequireCallError) {
        throw new InvalidRequireCallError(error, filename);
      }
      throw error;
    }
    if (!options.dev) {
      dependencies = optimizeDependencies(ast, dependencies, dependencyMapName);
    }
    dependencies = dependencies.map(dep => dep.name);
    wrappedAst = JsFileWrapping.wrapModule(ast, dependencyMapName);
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

  const map = result.rawMappings ? result.rawMappings.map(toSegmentTuple) : [];

  return {
    result: {dependencies, code: result.code, map},
    transformFileStartLogEntry,
    transformFileEndLogEntry,
  };
}

function getDynamicDepsBehavior(
  inPackages: DynamicRequiresBehavior,
  filename: string,
): DynamicRequiresBehavior {
  switch (inPackages) {
    case 'reject':
      return 'reject';
    case 'throwAtRuntime':
      const isPackage = /(?:^|[/\\])node_modules[/\\]/.test(filename);
      return isPackage ? inPackages : 'reject';
    default:
      (inPackages: empty);
      throw new Error(
        `invalid value for dynamic deps behavior: \`${inPackages}\``,
      );
  }
}

function transformCode(
  filename: string,
  localPath: LocalPath,
  sourceCode: string,
  transformerPath: string,
  isScript: boolean,
  options: Options,
  assetExts: $ReadOnlyArray<string>,
  assetRegistryPath: string,
  dynamicDepsInPackages: DynamicRequiresBehavior,
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

  // $FlowFixMe: impossible to type a dynamic require.
  const transformer: Transformer<*> = require(transformerPath);

  const transformerArgs = {
    filename,
    localPath,
    options,
    plugins,
    src: sourceCode,
  };

  const transformResult = isAsset(filename, assetExts)
    ? assetTransformer.transform(
        transformerArgs,
        assetRegistryPath,
        options.assetDataPlugins,
      )
    : transformer.transform(transformerArgs);

  const postTransformArgs = [
    filename,
    localPath,
    sourceCode,
    isScript,
    options,
    transformFileStartLogEntry,
    dynamicDepsInPackages,
  ];

  return transformResult instanceof Promise
    ? transformResult.then(({ast}) => postTransform(...postTransformArgs, ast))
    : postTransform(...postTransformArgs, transformResult.ast);
}

function minifyCode(
  filename: string,
  code: string,
  sourceMap: BabelSourceMap,
): ResultWithMap | Promise<ResultWithMap> {
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
}

function isAsset(filePath: string, assetExts: $ReadOnlyArray<string>): boolean {
  return assetExts.indexOf(path.extname(filePath).slice(1)) !== -1;
}

class InvalidRequireCallError extends Error {
  innerError: collectDependencies.InvalidRequireCallError;
  filename: string;

  constructor(
    innerError: collectDependencies.InvalidRequireCallError,
    filename: string,
  ) {
    super(`${filename}:${innerError.message}`);
    this.innerError = innerError;
    this.filename = filename;
  }
}

module.exports = {
  transform: transformCode,
  minify: minifyCode,
  InvalidRequireCallError,
};
