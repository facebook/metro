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

const JsFileWrapping = require('../ModuleGraph/worker/JsFileWrapping');

const assetTransformer = require('../assetTransformer');
const babylon = require('@babel/parser');
const collectDependencies = require('../ModuleGraph/worker/collectDependencies');
const constantFoldingPlugin = require('./worker/constant-folding-plugin');
const generateImportNames = require('../ModuleGraph/worker/generateImportNames');
const generate = require('@babel/generator').default;
const getMinifier = require('../lib/getMinifier');
const importExportPlugin = require('./worker/import-export-plugin');
const inlinePlugin = require('./worker/inline-plugin');
const inlineRequiresPlugin = require('babel-preset-fbjs/plugins/inline-requires');
const normalizePseudoglobals = require('./worker/normalizePseudoglobals');
const {transformFromAstSync} = require('@babel/core');
const types = require('@babel/types');

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
import type {MetroSourceMapSegmentTuple} from 'metro-source-map';

export type TransformArgs = {|
  filename: string,
  localPath: string,
  options: TransformOptions,
  plugins?: BabelPlugins,
  src: string,
|};

export type TransformResults = {
  ast: Ast,
};

export type Transform = TransformArgs => TransformResults;

export type Transformer = {
  transform: Transform,
  getCacheKey: () => string,
};

export type MinifyOptions = {
  filename?: string,
  reserved?: $ReadOnlyArray<string>,
};

export type Type = 'script' | 'module' | 'asset';

export type WorkerOptions = {|
  +assetPlugins: $ReadOnlyArray<string>,
  +assetRegistryPath: string,
  +asyncRequireModulePath: string,
  +babelTransformerPath: string,
  +dynamicDepsInPackages: DynamicRequiresBehavior,
  +minifierPath: string,
  +optimizationSizeLimit: number,
  +transformOptions: TransformOptions,
  +type: Type,
|};

export type CustomTransformOptions = {[string]: mixed, __proto__: null};

export type TransformOptions = {
  +customTransformOptions?: CustomTransformOptions,
  +enableBabelRCLookup?: boolean,
  +experimentalImportSupport?: boolean,
  +dev: boolean,
  +hot?: boolean,
  +inlineRequires: boolean,
  +minify: boolean,
  +platform: ?string,
  +projectRoot: string,
};

export type JsOutput = {|
  +data: {|
    +code: string,
    +map: Array<MetroSourceMapSegmentTuple>,
  |},
  +type: string,
|};

type Result = {|
  output: $ReadOnlyArray<JsOutput>,
  dependencies: $ReadOnlyArray<TransformResultDependency>,
|};

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

async function transform(
  filename: string,
  localPath: LocalPath,
  data: Buffer,
  options: WorkerOptions,
): Promise<Result> {
  const sourceCode = data.toString('utf8');
  let type = 'js/module';

  if (options.type === 'asset') {
    type = 'js/module/asset';
  }
  if (options.type === 'script') {
    type = 'js/script';
  }

  if (filename.endsWith('.json')) {
    let code = JsFileWrapping.wrapJson(sourceCode);
    let map = [];

    if (options.transformOptions.minify) {
      ({map, code} = await minifyCode(
        filename,
        code,
        sourceCode,
        map,
        options.minifierPath,
      ));
    }

    return {dependencies: [], output: [{data: {code, map}, type}]};
  }

  // $FlowFixMe TODO t26372934 Plugin system
  const transformer: Transformer<*> = require(options.babelTransformerPath);

  const transformerArgs = {
    filename,
    localPath,
    options: {
      ...options.transformOptions,
      // Inline requires are now performed at a secondary step. We cannot
      // unfortunately remove it from the internal transformer, since this one
      // is used by other tooling, and this would affect it.
      inlineRequires: false,
    },
    plugins: [],
    src: sourceCode,
  };

  const transformResult =
    type === 'js/module/asset'
      ? await assetTransformer.transform(
          transformerArgs,
          options.assetRegistryPath,
          options.assetPlugins,
        )
      : await transformer.transform(transformerArgs);

  // Transformers can ouptut null ASTs (if they ignore the file). In that case
  // we need to parse the module source code to get their AST.
  let ast =
    transformResult.ast || babylon.parse(sourceCode, {sourceType: 'module'});

  const {importDefault, importAll} = generateImportNames(ast);

  // Add "use strict" if the file was parsed as a module, and the directive did
  // not exist yet.
  const {directives} = ast.program;

  if (
    ast.program.sourceType === 'module' &&
    directives.findIndex(d => d.value.value === 'use strict') === -1
  ) {
    directives.push(types.directive(types.directiveLiteral('use strict')));
  }

  // Perform the import-export transform (in case it's still needed), then
  // fold requires and perform constant folding (if in dev).
  const plugins = [];
  const opts = {
    ...options.transformOptions,
    inlineableCalls: [importDefault, importAll],
    importDefault,
    importAll,
  };

  if (options.transformOptions.experimentalImportSupport) {
    plugins.push([importExportPlugin, opts]);
  }

  if (options.transformOptions.inlineRequires) {
    plugins.push([inlineRequiresPlugin, opts]);
  }

  if (!options.transformOptions.dev) {
    plugins.push([constantFoldingPlugin, opts]);
    plugins.push([inlinePlugin, opts]);
  }

  ({ast} = transformFromAstSync(ast, '', {
    ast: true,
    babelrc: false,
    code: false,
    configFile: false,
    comments: false,
    compact: false,
    filename: localPath,
    plugins,
    sourceMaps: false,
  }));

  let dependencyMapName = '';
  let dependencies;
  let wrappedAst;

  // If the module to transform is a script (meaning that is not part of the
  // dependency graph and it code will just be prepended to the bundle modules),
  // we need to wrap it differently than a commonJS module (also, scripts do
  // not have dependencies).
  if (type === 'js/script') {
    dependencies = [];
    wrappedAst = JsFileWrapping.wrapPolyfill(ast);
  } else {
    try {
      const opts = {
        asyncRequireModulePath: options.asyncRequireModulePath,
        dynamicRequires: getDynamicDepsBehavior(
          options.dynamicDepsInPackages,
          filename,
        ),
        inlineableCalls: [importDefault, importAll],
        keepRequireNames: options.transformOptions.dev,
      };
      ({dependencies, dependencyMapName} = collectDependencies(ast, opts));
    } catch (error) {
      if (error instanceof collectDependencies.InvalidRequireCallError) {
        throw new InvalidRequireCallError(error, filename);
      }
      throw error;
    }

    ({ast: wrappedAst} = JsFileWrapping.wrapModule(
      ast,
      importDefault,
      importAll,
      dependencyMapName,
    ));
  }

  const reserved =
    options.transformOptions.minify &&
    data.length <= options.optimizationSizeLimit
      ? normalizePseudoglobals(wrappedAst)
      : [];

  const result = generate(
    wrappedAst,
    {
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

  if (options.transformOptions.minify) {
    ({map, code} = await minifyCode(
      filename,
      result.code,
      sourceCode,
      map,
      options.minifierPath,
      {reserved},
    ));
  }

  return {dependencies, output: [{data: {code, map}, type}]};
}

async function minifyCode(
  filename: string,
  code: string,
  source: string,
  map: Array<MetroSourceMapSegmentTuple>,
  minifierPath: string,
  options?: MinifyOptions = {},
): Promise<{
  code: string,
  map: Array<MetroSourceMapSegmentTuple>,
}> {
  const sourceMap = fromRawMappings([
    {code, source, map, path: filename},
  ]).toMap(undefined, {});

  const minify = getMinifier(minifierPath);

  try {
    const minified = minify.withSourceMap(code, sourceMap, filename, options);

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

function getTransformDependencies(): $ReadOnlyArray<string> {
  return [
    require.resolve('../ModuleGraph/worker/JsFileWrapping'),
    require.resolve('../assetTransformer'),
    require.resolve('../ModuleGraph/worker/collectDependencies'),
    require.resolve('./worker/constant-folding-plugin'),
    require.resolve('../lib/getMinifier'),
    require.resolve('./worker/inline-plugin'),
    require.resolve('./worker/normalizePseudoglobals'),
    require.resolve('../ModuleGraph/worker/optimizeDependencies'),
  ];
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
  transform,
  getTransformDependencies,
};
