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

const HermesCompiler = require('metro-hermes-compiler');
const JsFileWrapping = require('metro/src/ModuleGraph/worker/JsFileWrapping');

const assetTransformer = require('./utils/assetTransformer');
const babylon = require('@babel/parser');
const collectDependencies = require('metro/src/ModuleGraph/worker/collectDependencies');
const generateImportNames = require('metro/src/ModuleGraph/worker/generateImportNames');
const nullthrows = require('nullthrows');
const generate = require('@babel/generator').default;
const getCacheKey = require('metro-cache-key');
const getMinifier = require('./utils/getMinifier');
const {
  constantFoldingPlugin,
  getTransformPluginCacheKeyFiles,
  importExportPlugin,
  inlinePlugin,
  normalizePseudoGlobals,
} = require('metro-transform-plugins');
const inlineRequiresPlugin = require('babel-preset-fbjs/plugins/inline-requires');
const {transformFromAstSync} = require('@babel/core');
const {stableHash} = require('metro-cache');
const types = require('@babel/types');
const countLines = require('metro/src/lib/countLines');

const {
  fromRawMappings,
  toBabelSegments,
  toSegmentTuple,
} = require('metro-source-map');
import type {TransformResultDependency} from 'metro/src/DeltaBundler';
import type {AllowOptionalDependencies} from 'metro/src/DeltaBundler/types.flow.js';
import type {DynamicRequiresBehavior} from 'metro/src/ModuleGraph/worker/collectDependencies';
import type {
  BasicSourceMap,
  FBSourceFunctionMap,
  MetroSourceMapSegmentTuple,
} from 'metro-source-map';
import type {
  HermesCompilerResult,
  Options as HermesCompilerOptions,
} from 'metro-hermes-compiler';
import type {
  CustomTransformOptions,
  TransformProfile,
} from 'metro-babel-transformer';

type MinifierConfig = $ReadOnly<{[string]: mixed, ...}>;

export type MinifierOptions = {
  code: string,
  map: ?BasicSourceMap,
  filename: string,
  reserved: $ReadOnlyArray<string>,
  config: MinifierConfig,
  ...
};

export type MinifierResult = {
  code: string,
  map?: BasicSourceMap,
  ...
};

export type Minifier = MinifierOptions => MinifierResult;

export type Type = 'script' | 'module' | 'asset';

export type JsTransformerConfig = $ReadOnly<{|
  assetPlugins: $ReadOnlyArray<string>,
  assetRegistryPath: string,
  asyncRequireModulePath: string,
  babelTransformerPath: string,
  dynamicDepsInPackages: DynamicRequiresBehavior,
  enableBabelRCLookup: boolean,
  enableBabelRuntime: boolean,
  experimentalImportBundleSupport: boolean,
  globalPrefix: string,
  minifierConfig: MinifierConfig,
  minifierPath: string,
  optimizationSizeLimit: number,
  publicPath: string,
  allowOptionalDependencies: AllowOptionalDependencies,
|}>;

export type {CustomTransformOptions} from 'metro-babel-transformer';

export type JsTransformOptions = $ReadOnly<{|
  customTransformOptions?: CustomTransformOptions,
  dev: boolean,
  experimentalImportSupport?: boolean,
  hot: boolean,
  inlinePlatform: boolean,
  inlineRequires: boolean,
  minify: boolean,
  nonInlinedRequires?: $ReadOnlyArray<string>,
  platform: ?string,
  runtimeBytecodeVersion: ?number,
  type: Type,
  unstable_disableES6Transforms?: boolean,
  unstable_transformProfile: TransformProfile,
|}>;

export type JsOutput = $ReadOnly<{|
  data: $ReadOnly<{|
    code: string,
    lineCount: number,
    map: Array<MetroSourceMapSegmentTuple>,
    functionMap: ?FBSourceFunctionMap,
  |}>,
  type: string,
|}>;

export type BytecodeOutput = $ReadOnly<{|
  data: HermesCompilerResult,
  type: 'bytecode/module' | 'bytecode/module/asset' | 'bytecode/script',
|}>;

type Result = {|
  dependencies: $ReadOnlyArray<TransformResultDependency>,
  output: $ReadOnlyArray<JsOutput | BytecodeOutput>,
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

const minifyCode = async (
  config: JsTransformerConfig,
  projectRoot: string,
  filename: string,
  code: string,
  source: string,
  map: Array<MetroSourceMapSegmentTuple>,
  reserved?: $ReadOnlyArray<string> = [],
): Promise<{
  code: string,
  map: Array<MetroSourceMapSegmentTuple>,
  ...
}> => {
  const sourceMap = fromRawMappings([
    {code, source, map, functionMap: null, path: filename},
  ]).toMap(undefined, {});

  const minify = getMinifier(config.minifierPath);

  try {
    const minified = minify({
      code,
      map: sourceMap,
      filename,
      reserved,
      config: config.minifierConfig,
    });

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
};

const compileToBytecode = (
  code: string,
  type: string,
  options: HermesCompilerOptions,
): HermesCompilerResult => {
  if (type.startsWith('js/module')) {
    const index = code.lastIndexOf(')');
    code =
      code.slice(0, index) +
      ',$$METRO_D[0],$$METRO_D[1],$$METRO_D[2]' +
      code.slice(index);
  }
  return HermesCompiler.compile(code, options);
};

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
  transform: async (
    config: JsTransformerConfig,
    projectRoot: string,
    filename: string,
    data: Buffer,
    options: JsTransformOptions,
  ): Promise<Result> => {
    const sourceCode = data.toString('utf8');
    let type = 'js/module';
    let bytecodeType = 'bytecode/module';

    if (options.type === 'asset') {
      type = 'js/module/asset';
      bytecodeType = 'bytecode/module/asset';
    }
    if (options.type === 'script') {
      type = 'js/script';
      bytecodeType = 'bytecode/script';
    }

    if (filename.endsWith('.json')) {
      let code = JsFileWrapping.wrapJson(sourceCode, config.globalPrefix);
      let map = [];

      if (options.minify) {
        ({map, code} = await minifyCode(
          config,
          projectRoot,
          filename,
          code,
          sourceCode,
          map,
        ));
      }

      const output = [
        {
          data: {code, lineCount: countLines(code), map, functionMap: null},
          type,
        },
      ];
      if (options.runtimeBytecodeVersion) {
        output.push({
          data: (compileToBytecode(code, type, {
            sourceURL: filename,
            sourceMap: fromRawMappings([
              {
                code,
                source: sourceCode,
                map,
                functionMap: null,
                path: filename,
              },
            ]).toString(),
          }): HermesCompilerResult),
          type: bytecodeType,
        });
      }

      return {
        dependencies: [],
        output,
      };
    }

    // $FlowFixMe TODO t26372934 Plugin system
    const transformer: Transformer<*> = require(config.babelTransformerPath);

    const transformerArgs = {
      filename,
      options: {
        ...options,
        enableBabelRCLookup: config.enableBabelRCLookup,
        enableBabelRuntime: config.enableBabelRuntime,
        globalPrefix: config.globalPrefix,
        // Inline requires are now performed at a secondary step. We cannot
        // unfortunately remove it from the internal transformer, since this one
        // is used by other tooling, and this would affect it.
        inlineRequires: false,
        nonInlinedRequires: [],
        projectRoot,
        publicPath: config.publicPath,
      },
      plugins: [],
      src: sourceCode,
    };

    const transformResult =
      type === 'js/module/asset'
        ? {
            ...(await assetTransformer.transform(
              transformerArgs,
              config.assetRegistryPath,
              config.assetPlugins,
            )),
            functionMap: null,
          }
        : await transformer.transform(transformerArgs);

    // Transformers can ouptut null ASTs (if they ignore the file). In that case
    // we need to parse the module source code to get their AST.
    let ast =
      transformResult.ast ||
      babylon.parse(sourceCode, {sourceType: 'unambiguous'});

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
      ...options,
      inlineableCalls: [importDefault, importAll],
      importDefault,
      importAll,
    };

    if (options.experimentalImportSupport) {
      plugins.push([importExportPlugin, opts]);
    }

    if (options.inlineRequires) {
      plugins.push([
        inlineRequiresPlugin,
        {
          ...opts,
          ignoredRequires: options.nonInlinedRequires,
        },
      ]);
    }

    if (!options.dev) {
      plugins.push([constantFoldingPlugin, opts]);
    }

    plugins.push([inlinePlugin, opts]);

    ast = nullthrows(
      transformFromAstSync(ast, '', {
        ast: true,
        babelrc: false,
        code: false,
        configFile: false,
        comments: false,
        compact: false,
        filename,
        plugins,
        sourceMaps: false,
      }).ast,
    );

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
          asyncRequireModulePath: config.asyncRequireModulePath,
          dynamicRequires: getDynamicDepsBehavior(
            config.dynamicDepsInPackages,
            filename,
          ),
          inlineableCalls: [importDefault, importAll],
          keepRequireNames: options.dev,
          allowOptionalDependencies: config.allowOptionalDependencies,
        };
        ({ast, dependencies, dependencyMapName} = collectDependencies(
          ast,
          opts,
        ));
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
        config.globalPrefix,
      ));
    }

    const reserved =
      options.minify && data.length <= config.optimizationSizeLimit
        ? normalizePseudoGlobals(wrappedAst)
        : [];

    const result = generate(
      wrappedAst,
      {
        comments: false,
        compact: false,
        filename,
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
        config,
        projectRoot,
        filename,
        result.code,
        sourceCode,
        map,
        reserved,
      ));
    }

    const output = [
      {
        data: {
          code,
          lineCount: countLines(code),
          map,
          functionMap: transformResult.functionMap,
        },
        type,
      },
    ];

    if (options.runtimeBytecodeVersion) {
      output.push({
        data: (compileToBytecode(code, type, {
          sourceURL: filename,
          sourceMap: fromRawMappings([
            {code, source: sourceCode, map, functionMap: null, path: filename},
          ]).toString(),
        }): HermesCompilerResult),
        type: bytecodeType,
      });
    }

    return {
      dependencies,
      output,
    };
  },

  getCacheKey: (config: JsTransformerConfig): string => {
    const {babelTransformerPath, minifierPath, ...remainingConfig} = config;

    const filesKey = getCacheKey([
      require.resolve(babelTransformerPath),
      require.resolve(minifierPath),
      require.resolve('./utils/getMinifier'),
      require.resolve('./utils/assetTransformer'),
      require.resolve('metro/src/ModuleGraph/worker/collectDependencies'),
      require.resolve('metro/src/ModuleGraph/worker/generateImportNames'),
      require.resolve('metro/src/ModuleGraph/worker/JsFileWrapping'),
      ...getTransformPluginCacheKeyFiles(),
    ]);

    const babelTransformer = require(babelTransformerPath);
    return [
      filesKey,
      stableHash(remainingConfig).toString('hex'),
      babelTransformer.getCacheKey ? babelTransformer.getCacheKey() : '',
    ].join('$');
  },
};
