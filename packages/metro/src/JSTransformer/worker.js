/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const JsFileWrapping = require('../ModuleGraph/worker/JsFileWrapping');

const assetTransformer = require('../assetTransformer');
const collectDependencies = require('../ModuleGraph/worker/collectDependencies');
const constantFoldingPlugin = require('./worker/constant-folding-plugin');
const crypto = require('crypto');
const fs = require('fs');
const getMinifier = require('../lib/getMinifier');
const inlinePlugin = require('./worker/inline-plugin');
const optimizeDependencies = require('../ModuleGraph/worker/optimizeDependencies');
const path = require('path');

const {babylon} = require('../babel-bridge');
const {babelGenerate: generate} = require('../babel-bridge');
const {
  fromRawMappings,
  toBabelSegments,
  toSegmentTuple,
} = require('metro-source-map');

import type {DynamicRequiresBehavior} from '../ModuleGraph/worker/collectDependencies';
import type {LocalPath} from '../node-haste/lib/toLocalPath';
import type {Ast} from '@babel/core';
import type {BabelSourceMap} from '@babel/core';
import type {Plugins as BabelPlugins} from 'babel-core';
import type {LogEntry} from 'metro-core/src/Logger';
import type {ResultWithMap} from 'metro-minify-uglify';
import type {MetroSourceMapSegmentTuple} from 'metro-source-map';

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

export type CustomTransformOptions = {[string]: mixed, __proto__: null};

export type TransformOptionsStrict = {|
  +assetDataPlugins: $ReadOnlyArray<string>,
  +customTransformOptions?: CustomTransformOptions,
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
  +customTransformOptions?: CustomTransformOptions,
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
  sha1: string,
  transformFileStartLogEntry: LogEntry,
  transformFileEndLogEntry: LogEntry,
};

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

async function transformCode(
  filename: string,
  localPath: LocalPath,
  sourceCode: ?string,
  transformerPath: string,
  isScript: boolean,
  options: Options,
  assetExts: $ReadOnlyArray<string>,
  assetRegistryPath: string,
  minifierPath: string,
  asyncRequireModulePath: string,
  dynamicDepsInPackages: DynamicRequiresBehavior,
): Promise<Data> {
  const transformFileStartLogEntry = {
    action_name: 'Transforming file',
    action_phase: 'start',
    file_name: filename,
    log_entry_label: 'Transforming file',
    start_timestamp: process.hrtime(),
  };

  let data;

  if (sourceCode == null) {
    data = fs.readFileSync(filename);
    sourceCode = data.toString('utf8');
  }

  const sha1 = crypto
    .createHash('sha1')
    .update(data || sourceCode)
    .digest('hex');

  if (filename.endsWith('.json')) {
    const code = JsFileWrapping.wrapJson(sourceCode);

    const transformFileEndLogEntry = getEndLogEntry(
      transformFileStartLogEntry,
      filename,
    );

    return {
      result: {dependencies: [], code, map: []},
      sha1,
      transformFileStartLogEntry,
      transformFileEndLogEntry,
    };
  }

  const plugins = options.dev
    ? []
    : [[inlinePlugin, options], [constantFoldingPlugin, options]];

  // $FlowFixMe TODO t26372934 Plugin system
  const transformer: Transformer<*> = require(transformerPath);

  const transformerArgs = {
    filename,
    localPath,
    options,
    plugins,
    src: sourceCode,
  };

  const transformResult = isAsset(filename, assetExts)
    ? await assetTransformer.transform(
        transformerArgs,
        assetRegistryPath,
        options.assetDataPlugins,
      )
    : await transformer.transform(transformerArgs);

  // Transformers can ouptut null ASTs (if they ignore the file). In that case
  // we need to parse the module source code to get their AST.
  const ast =
    transformResult.ast || babylon.parse(sourceCode, {sourceType: 'module'});

  const transformFileEndLogEntry = getEndLogEntry(
    transformFileStartLogEntry,
    filename,
  );

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
        asyncRequireModulePath,
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

    const wrapped = JsFileWrapping.wrapModule(ast, dependencyMapName);

    wrappedAst = wrapped.ast;

    if (!options.dev) {
      dependencies = optimizeDependencies(
        wrappedAst,
        dependencies,
        dependencyMapName,
        wrapped.requireName,
      );
    }

    dependencies = dependencies.map(dep => dep.name);
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

  let map = result.rawMappings ? result.rawMappings.map(toSegmentTuple) : [];
  let code = result.code;

  if (options.minify) {
    const sourceMap = fromRawMappings([
      {code, source: sourceCode, map, path: filename},
    ]).toMap(undefined, {});

    const minified = await minifyCode(
      filename,
      result.code,
      sourceMap,
      minifierPath,
    );

    code = minified.code;
    map = minified.map ? toBabelSegments(minified.map).map(toSegmentTuple) : [];
  }

  return {
    result: {dependencies, code, map},
    sha1,
    transformFileStartLogEntry,
    transformFileEndLogEntry,
  };
}

function minifyCode(
  filename: string,
  code: string,
  sourceMap: BabelSourceMap,
  minifierPath: string,
): ResultWithMap | Promise<ResultWithMap> {
  const minify = getMinifier(minifierPath);
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

function getEndLogEntry(startLogEntry: LogEntry, filename: string): LogEntry {
  const timeDelta = process.hrtime(startLogEntry.start_timestamp);
  const duration_ms = Math.round((timeDelta[0] * 1e9 + timeDelta[1]) / 1e6);

  return {
    action_name: 'Transforming file',
    action_phase: 'end',
    file_name: filename,
    duration_ms,
    log_entry_label: 'Transforming file',
  };
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
  InvalidRequireCallError,
};
