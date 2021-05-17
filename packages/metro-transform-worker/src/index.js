/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const HermesCompiler = require('metro-hermes-compiler');
const JsFileWrapping = require('metro/src/ModuleGraph/worker/JsFileWrapping');

const babylon = require('@babel/parser');
const collectDependencies = require('metro/src/ModuleGraph/worker/collectDependencies');
const generateImportNames = require('metro/src/ModuleGraph/worker/generateImportNames');
const generate = require('@babel/generator').default;
const getCacheKey = require('metro-cache-key');
const getMinifier = require('./utils/getMinifier');
const metroTransformPlugins = require('metro-transform-plugins');
const {transformFromAstSync} = require('@babel/core');
const {stableHash} = require('metro-cache');
const types = require('@babel/types');
const countLines = require('metro/src/lib/countLines');
const nullthrows = require('nullthrows');

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
  BabelTransformer,
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
  hermesParser: boolean,
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

export type BytecodeFileType =
  | 'bytecode/module'
  | 'bytecode/module/asset'
  | 'bytecode/script';

opaque type Path = string;

type FileType = 'js/script' | 'js/module' | 'js/module/asset';

type JSFile = $ReadOnly<{
  ast?: ?BabelNodeFile,
  code: string,
  filename: Path,
  inputFileSize: number,
  type: FileType,
  functionMap: FBSourceFunctionMap | null,
}>;

type TransformationContext = $ReadOnly<{
  config: JsTransformerConfig,
  projectRoot: Path,
  options: JsTransformOptions,
}>;

export type JsOutput = $ReadOnly<{|
  data: $ReadOnly<{|
    code: string,
    lineCount: number,
    map: Array<MetroSourceMapSegmentTuple>,
    functionMap: ?FBSourceFunctionMap,
  |}>,
  type: FileType,
|}>;

export type BytecodeOutput = $ReadOnly<{|
  data: HermesCompilerResult,
  type: BytecodeFileType,
|}>;

type TransformResponse = $ReadOnly<{
  dependencies: $ReadOnlyArray<TransformResultDependency>,
  output: $ReadOnlyArray<JsOutput | BytecodeOutput>,
}>;

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
  rawCode: string,
  type: string,
  options: HermesCompilerOptions,
): HermesCompilerResult => {
  let code = rawCode;
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

async function transformJS(
  file: JSFile,
  {config, options, projectRoot}: TransformationContext,
): Promise<TransformResponse> {
  // Transformers can output null ASTs (if they ignore the file). In that case
  // we need to parse the module source code to get their AST.
  let ast = file.ast ?? babylon.parse(file.code, {sourceType: 'unambiguous'});

  const {importDefault, importAll} = generateImportNames(ast);

  // Add "use strict" if the file was parsed as a module, and the directive did
  // not exist yet.
  const {directives} = ast.program;

  if (
    ast.program.sourceType === 'module' &&
    directives != null &&
    directives.findIndex(d => d.value.value === 'use strict') === -1
  ) {
    directives.push(types.directive(types.directiveLiteral('use strict')));
  }

  // Perform the import-export transform (in case it's still needed), then
  // fold requires and perform constant folding (if in dev).
  const plugins = [];
  const babelPluginOpts = {
    ...options,
    inlineableCalls: [importDefault, importAll],
    importDefault,
    importAll,
  };

  if (options.experimentalImportSupport === true) {
    plugins.push([metroTransformPlugins.importExportPlugin, babelPluginOpts]);
  }

  if (options.inlineRequires) {
    plugins.push([
      // $FlowFixMe[untyped-import] untyped module
      require('babel-preset-fbjs/plugins/inline-requires'),
      {
        ...babelPluginOpts,
        ignoredRequires: options.nonInlinedRequires,
      },
    ]);
  }

  if (!options.dev) {
    plugins.push([
      metroTransformPlugins.constantFoldingPlugin,
      babelPluginOpts,
    ]);
  }

  plugins.push([metroTransformPlugins.inlinePlugin, babelPluginOpts]);

  ast = nullthrows(
    transformFromAstSync(ast, '', {
      ast: true,
      babelrc: false,
      code: false,
      configFile: false,
      comments: false,
      compact: false,
      filename: file.filename,
      plugins,
      sourceMaps: false,
      // Not-Cloning the input AST here should be safe because other code paths above this call
      // are mutating the AST as well and no code is depending on the original AST.
      // However, switching the flag to false caused issues with ES Modules if `experimentalImportSupport` isn't used https://github.com/facebook/metro/issues/641
      // either because one of the plugins is doing something funky or Babel messes up some caches.
      // Make sure to test the above mentioned case before flipping the flag back to false.
      cloneInputAst: true,
    }).ast,
  );

  let dependencyMapName = '';
  let dependencies;
  let wrappedAst;

  // If the module to transform is a script (meaning that is not part of the
  // dependency graph and it code will just be prepended to the bundle modules),
  // we need to wrap it differently than a commonJS module (also, scripts do
  // not have dependencies).
  if (file.type === 'js/script') {
    dependencies = [];
    wrappedAst = JsFileWrapping.wrapPolyfill(ast);
  } else {
    try {
      const opts = {
        asyncRequireModulePath: config.asyncRequireModulePath,
        dynamicRequires: getDynamicDepsBehavior(
          config.dynamicDepsInPackages,
          file.filename,
        ),
        inlineableCalls: [importDefault, importAll],
        keepRequireNames: options.dev,
        allowOptionalDependencies: config.allowOptionalDependencies,
      };
      ({ast, dependencies, dependencyMapName} = collectDependencies(ast, opts));
    } catch (error) {
      if (error instanceof collectDependencies.InvalidRequireCallError) {
        throw new InvalidRequireCallError(error, file.filename);
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
    options.minify && file.inputFileSize <= config.optimizationSizeLimit
      ? metroTransformPlugins.normalizePseudoGlobals(wrappedAst)
      : [];

  const result = generate(
    wrappedAst,
    {
      comments: false,
      compact: false,
      filename: file.filename,
      retainLines: false,
      sourceFileName: file.filename,
      sourceMaps: true,
    },
    file.code,
  );

  let map = result.rawMappings ? result.rawMappings.map(toSegmentTuple) : [];
  let code = result.code;

  if (options.minify) {
    ({map, code} = await minifyCode(
      config,
      projectRoot,
      file.filename,
      result.code,
      file.code,
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
        functionMap: file.functionMap,
      },
      type: file.type,
    },
  ];

  if (options.runtimeBytecodeVersion != null) {
    output.push({
      data: (compileToBytecode(code, file.type, {
        sourceURL: file.filename,
        sourceMap: fromRawMappings([
          {
            code,
            source: file.code,
            map,
            functionMap: null,
            path: file.filename,
          },
        ]).toString(),
      }): HermesCompilerResult),
      type: getBytecodeFileType(file.type),
    });
  }

  return {
    dependencies,
    output,
  };
}

/**
 * Returns the bytecode type for a file type
 */
function getBytecodeFileType(type: FileType): BytecodeFileType {
  switch (type) {
    case 'js/module/asset':
      return 'bytecode/module/asset';
    case 'js/script':
      return 'bytecode/script';
    default:
      (type: 'js/module');
      return 'bytecode/module';
  }
}

module.exports = {
  transform: async (
    config: JsTransformerConfig,
    projectRoot: string,
    filename: string,
    data: Buffer,
    options: JsTransformOptions,
  ): Promise<TransformResponse> => {
    const sourceCode = data.toString('utf8');
    let type = 'js/module';

    if (options.type === 'asset') {
      type = 'js/module/asset';
    }
    if (options.type === 'script') {
      type = 'js/script';
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
      if (options.runtimeBytecodeVersion != null) {
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
          type: getBytecodeFileType(type),
        });
      }

      return {
        dependencies: [],
        output,
      };
    }

    const transformerArgs = {
      filename,
      options: {
        ...options,
        enableBabelRCLookup: config.enableBabelRCLookup,
        enableBabelRuntime: config.enableBabelRuntime,
        globalPrefix: config.globalPrefix,
        hermesParser: config.hermesParser,
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

    let transformResult;

    if (type === 'js/module/asset') {
      const assetTransformer = require('./utils/assetTransformer');

      transformResult = {
        ...(await assetTransformer.transform(
          transformerArgs,
          config.assetRegistryPath,
          config.assetPlugins,
        )),
        functionMap: null,
      };
    } else {
      // $FlowFixMe[unsupported-syntax] dynamic require
      const transformer: BabelTransformer = require(config.babelTransformerPath);
      transformResult = await transformer.transform(transformerArgs);
    }

    const context: TransformationContext = {
      config,
      projectRoot,
      options,
    };

    const file: JSFile = {
      filename,
      inputFileSize: data.length,
      code: sourceCode,
      type,
      ast: transformResult.ast,
      functionMap: transformResult.functionMap ?? null,
    };

    return await transformJS(file, context);
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
      ...metroTransformPlugins.getTransformPluginCacheKeyFiles(),
    ]);

    const babelTransformer = require(babelTransformerPath);
    return [
      filesKey,
      stableHash(remainingConfig).toString('hex'),
      babelTransformer.getCacheKey ? babelTransformer.getCacheKey() : '',
    ].join('$');
  },
};
