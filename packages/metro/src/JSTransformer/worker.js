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
const babylon = require('babylon');
const collectDependencies = require('../ModuleGraph/worker/collectDependencies');
const constantFoldingPlugin = require('./worker/constant-folding-plugin');
const crypto = require('crypto');
const fs = require('fs');
const generate = require('@babel/generator').default;
const getMinifier = require('../lib/getMinifier');
const inlinePlugin = require('./worker/inline-plugin');
const optimizeDependencies = require('../ModuleGraph/worker/optimizeDependencies');
const path = require('path');

const {
  fromRawMappings,
  toBabelSegments,
  toSegmentTuple,
} = require('metro-source-map');

import type {TransformResultDependency} from '../ModuleGraph/types.flow';
import type {DynamicRequiresBehavior} from '../ModuleGraph/worker/collectDependencies';
import type {LocalPath} from '../node-haste/lib/toLocalPath';
import type {Ast} from '@babel/core';
import type {Plugins as BabelPlugins} from 'babel-core';
import type {LogEntry} from 'metro-core/src/Logger';
import type {MetroSourceMapSegmentTuple} from 'metro-source-map';

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

export type TransformOptions = {
  +customTransformOptions?: CustomTransformOptions,
  +enableBabelRCLookup?: boolean,
  +dev?: boolean,
  +hot?: boolean,
  +inlineRequires: boolean,
  +platform: ?string,
  +projectRoot: string,
};

export type WorkerOptions = {|
  +assetDataPlugins: $ReadOnlyArray<string>,
  +customTransformOptions?: CustomTransformOptions,
  +enableBabelRCLookup: boolean,
  +dev: boolean,
  +hot: boolean,
  +inlineRequires: boolean,
  +isScript: boolean,
  +minify: boolean,
  +platform: ?string,
  +projectRoot: string,
|};

export type JsOutput = {|
  +data: {|
    +code: string,
    +map: Array<MetroSourceMapSegmentTuple>,
  |},
  +type: string,
|};

type Data = {
  result: {|
    output: $ReadOnlyArray<JsOutput>,
    dependencies: $ReadOnlyArray<TransformResultDependency>,
  |},
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
  transformerPath: string,
  options: WorkerOptions,
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

  const data = fs.readFileSync(filename);
  const sourceCode = data.toString('utf8');
  let type = 'js/module';

  const sha1 = crypto
    .createHash('sha1')
    .update(data)
    .digest('hex');

  if (filename.endsWith('.json')) {
    let code = JsFileWrapping.wrapJson(sourceCode);
    let map = [];

    const transformFileEndLogEntry = getEndLogEntry(
      transformFileStartLogEntry,
      filename,
    );

    if (options.minify) {
      ({map, code} = await minifyCode(
        filename,
        code,
        sourceCode,
        map,
        minifierPath,
      ));
    }

    return {
      result: {dependencies: [], output: [{data: {code, map}, type}]},
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

  if (isAsset(filename, assetExts)) {
    type = 'js/module/asset';
  }

  const transformResult =
    type === 'js/module/asset'
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
  if (options.isScript) {
    dependencies = [];
    wrappedAst = JsFileWrapping.wrapPolyfill(ast);

    type = 'js/script';
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
    ({map, code} = await minifyCode(
      filename,
      result.code,
      sourceCode,
      map,
      minifierPath,
    ));
  }

  return {
    result: {dependencies, output: [{data: {code, map}, type}]},
    sha1,
    transformFileStartLogEntry,
    transformFileEndLogEntry,
  };
}

async function minifyCode(
  filename: string,
  code: string,
  source: string,
  map: Array<MetroSourceMapSegmentTuple>,
  minifierPath: string,
): Promise<{
  code: string,
  map: Array<MetroSourceMapSegmentTuple>,
}> {
  const sourceMap = fromRawMappings([
    {code, source, map, path: filename},
  ]).toMap(undefined, {});

  const minify = getMinifier(minifierPath);

  try {
    const minified = minify.withSourceMap(code, sourceMap, filename);

    return {
      code: minified.code,
      map: minified.map
        ? toBabelSegments(minified.map).map(toSegmentTuple)
        : [],
    };
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
