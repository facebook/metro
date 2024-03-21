/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

'use strict';

import type {PluginEntry, Plugins} from '@babel/core';
import type {
  BabelTransformer,
  BabelTransformerArgs,
  CustomTransformOptions,
  TransformProfile,
} from 'metro-babel-transformer';
import type {
  BasicSourceMap,
  FBSourceFunctionMap,
  MetroSourceMapSegmentTuple,
} from 'metro-source-map';
import type {TransformResultDependency} from 'metro/src/DeltaBundler';
import type {AllowOptionalDependencies} from 'metro/src/DeltaBundler/types.flow.js';
import type {
  DependencyTransformer,
  DynamicRequiresBehavior,
} from 'metro/src/ModuleGraph/worker/collectDependencies';

const getMinifier = require('./utils/getMinifier');
const {transformFromAstSync} = require('@babel/core');
const generate = require('@babel/generator').default;
const babylon = require('@babel/parser');
const types = require('@babel/types');
const {stableHash} = require('metro-cache');
const getCacheKey = require('metro-cache-key');
const {
  fromRawMappings,
  functionMapBabelPlugin,
  toBabelSegments,
  toSegmentTuple,
} = require('metro-source-map');
const metroTransformPlugins = require('metro-transform-plugins');
const collectDependencies = require('metro/src/ModuleGraph/worker/collectDependencies');
const {
  InvalidRequireCallError: InternalInvalidRequireCallError,
} = require('metro/src/ModuleGraph/worker/collectDependencies');
const generateImportNames = require('metro/src/ModuleGraph/worker/generateImportNames');
const JsFileWrapping = require('metro/src/ModuleGraph/worker/JsFileWrapping');
const nullthrows = require('nullthrows');

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

export type Minifier = MinifierOptions =>
  | MinifierResult
  | Promise<MinifierResult>;

export type Type = 'script' | 'module' | 'asset';

export type JsTransformerConfig = $ReadOnly<{
  assetPlugins: $ReadOnlyArray<string>,
  assetRegistryPath: string,
  asyncRequireModulePath: string,
  babelTransformerPath: string,
  dynamicDepsInPackages: DynamicRequiresBehavior,
  enableBabelRCLookup: boolean,
  enableBabelRuntime: boolean | string,
  globalPrefix: string,
  hermesParser: boolean,
  minifierConfig: MinifierConfig,
  minifierPath: string,
  optimizationSizeLimit: number,
  publicPath: string,
  allowOptionalDependencies: AllowOptionalDependencies,
  unstable_dependencyMapReservedName: ?string,
  unstable_disableModuleWrapping: boolean,
  unstable_disableNormalizePseudoGlobals: boolean,
  unstable_compactOutput: boolean,
  /** Enable `require.context` statements which can be used to import multiple files in a directory. */
  unstable_allowRequireContext: boolean,
}>;

export type {CustomTransformOptions} from 'metro-babel-transformer';

export type JsTransformOptions = $ReadOnly<{
  customTransformOptions?: CustomTransformOptions,
  dev: boolean,
  experimentalImportSupport?: boolean,
  hot: boolean,
  inlinePlatform: boolean,
  inlineRequires: boolean,
  minify: boolean,
  nonInlinedRequires?: $ReadOnlyArray<string>,
  platform: ?string,
  type: Type,
  unstable_disableES6Transforms?: boolean,
  unstable_transformProfile: TransformProfile,
}>;

opaque type Path = string;

type BaseFile = $ReadOnly<{
  code: string,
  filename: Path,
  inputFileSize: number,
}>;

type AssetFile = $ReadOnly<{
  ...BaseFile,
  type: 'asset',
}>;

type JSFileType = 'js/script' | 'js/module' | 'js/module/asset';

type JSFile = $ReadOnly<{
  ...BaseFile,
  ast?: ?BabelNodeFile,
  type: JSFileType,
  functionMap: FBSourceFunctionMap | null,
}>;

type JSONFile = {
  ...BaseFile,
  type: Type,
};

type TransformationContext = $ReadOnly<{
  config: JsTransformerConfig,
  projectRoot: Path,
  options: JsTransformOptions,
}>;

export type JsOutput = $ReadOnly<{
  data: $ReadOnly<{
    code: string,
    lineCount: number,
    map: Array<MetroSourceMapSegmentTuple>,
    functionMap: ?FBSourceFunctionMap,
  }>,
  type: JSFileType,
}>;

type TransformResponse = $ReadOnly<{
  dependencies: $ReadOnlyArray<TransformResultDependency>,
  output: $ReadOnlyArray<JsOutput>,
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
    {
      code,
      source,
      map,
      // functionMap is overridden by the serializer
      functionMap: null,
      path: filename,
      // isIgnored is overriden by the serializer
      isIgnored: false,
    },
  ]).toMap(undefined, {});

  const minify = getMinifier(config.minifierPath);

  try {
    const minified = await minify({
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

const disabledDependencyTransformer: DependencyTransformer = {
  transformSyncRequire: () => void 0,
  transformImportCall: () => void 0,
  transformPrefetch: () => void 0,
  transformIllegalDynamicRequire: () => void 0,
};

class InvalidRequireCallError extends Error {
  innerError: InternalInvalidRequireCallError;
  filename: string;

  constructor(innerError: InternalInvalidRequireCallError, filename: string) {
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
  const plugins: Array<PluginEntry> = [];
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
      metroTransformPlugins.inlineRequiresPlugin,
      {
        ...babelPluginOpts,
        ignoredRequires: options.nonInlinedRequires,
      },
    ]);
  }

  plugins.push([metroTransformPlugins.inlinePlugin, babelPluginOpts]);

  ast = nullthrows(
    transformFromAstSync(ast, '', {
      ast: true,
      babelrc: false,
      code: false,
      configFile: false,
      comments: true,
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

  if (!options.dev) {
    // Run the constant folding plugin in its own pass, avoiding race conditions
    // with other plugins that have exit() visitors on Program (e.g. the ESM
    // transform).
    ast = nullthrows(
      transformFromAstSync(ast, '', {
        ast: true,
        babelrc: false,
        code: false,
        configFile: false,
        comments: true,
        filename: file.filename,
        plugins: [
          [metroTransformPlugins.constantFoldingPlugin, babelPluginOpts],
        ],
        sourceMaps: false,
        cloneInputAst: false,
      }).ast,
    );
  }

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
        dependencyTransformer:
          config.unstable_disableModuleWrapping === true
            ? disabledDependencyTransformer
            : undefined,
        dynamicRequires: getDynamicDepsBehavior(
          config.dynamicDepsInPackages,
          file.filename,
        ),
        inlineableCalls: [importDefault, importAll],
        keepRequireNames: options.dev,
        allowOptionalDependencies: config.allowOptionalDependencies,
        dependencyMapName: config.unstable_dependencyMapReservedName,
        unstable_allowRequireContext: config.unstable_allowRequireContext,
      };
      ({ast, dependencies, dependencyMapName} = collectDependencies(ast, opts));
    } catch (error) {
      if (error instanceof InternalInvalidRequireCallError) {
        throw new InvalidRequireCallError(error, file.filename);
      }
      throw error;
    }

    if (config.unstable_disableModuleWrapping === true) {
      wrappedAst = ast;
    } else {
      ({ast: wrappedAst} = JsFileWrapping.wrapModule(
        ast,
        importDefault,
        importAll,
        dependencyMapName,
        config.globalPrefix,
      ));
    }
  }

  const minify =
    options.minify &&
    options.unstable_transformProfile !== 'hermes-canary' &&
    options.unstable_transformProfile !== 'hermes-stable';

  const reserved = [];
  if (config.unstable_dependencyMapReservedName != null) {
    reserved.push(config.unstable_dependencyMapReservedName);
  }
  if (
    minify &&
    file.inputFileSize <= config.optimizationSizeLimit &&
    !config.unstable_disableNormalizePseudoGlobals
  ) {
    reserved.push(
      ...metroTransformPlugins.normalizePseudoGlobals(wrappedAst, {
        reservedNames: reserved,
      }),
    );
  }

  const result = generate(
    wrappedAst,
    {
      comments: true,
      compact: config.unstable_compactOutput,
      filename: file.filename,
      retainLines: false,
      sourceFileName: file.filename,
      sourceMaps: true,
    },
    file.code,
  );

  let map = result.rawMappings ? result.rawMappings.map(toSegmentTuple) : [];
  let code = result.code;

  if (minify) {
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

  let lineCount;
  ({lineCount, map} = countLinesAndTerminateMap(code, map));

  const output: Array<JsOutput> = [
    {
      data: {
        code,
        lineCount,
        map,
        functionMap: file.functionMap,
      },
      type: file.type,
    },
  ];

  return {
    dependencies,
    output,
  };
}

/**
 * Transforms an asset file
 */
async function transformAsset(
  file: AssetFile,
  context: TransformationContext,
): Promise<TransformResponse> {
  const assetTransformer = require('./utils/assetTransformer');
  const {assetRegistryPath, assetPlugins} = context.config;

  const result = await assetTransformer.transform(
    getBabelTransformArgs(file, context),
    assetRegistryPath,
    assetPlugins,
  );

  const jsFile = {
    ...file,
    type: 'js/module/asset',
    ast: result.ast,
    functionMap: null,
  };

  return transformJS(jsFile, context);
}

/**
 * Transforms a JavaScript file with Babel before processing the file with
 * the generic JavaScript transformation.
 */
async function transformJSWithBabel(
  file: JSFile,
  context: TransformationContext,
): Promise<TransformResponse> {
  const {babelTransformerPath} = context.config;
  // $FlowFixMe[unsupported-syntax] dynamic require
  const transformer: BabelTransformer = require(babelTransformerPath);

  const transformResult = await transformer.transform(
    // functionMapBabelPlugin populates metadata.metro.functionMap
    getBabelTransformArgs(file, context, [functionMapBabelPlugin]),
  );

  const jsFile: JSFile = {
    ...file,
    ast: transformResult.ast,
    functionMap:
      transformResult.metadata?.metro?.functionMap ??
      // Fallback to deprecated explicitly-generated `functionMap`
      transformResult.functionMap ??
      null,
  };

  return await transformJS(jsFile, context);
}

async function transformJSON(
  file: JSONFile,
  {options, config, projectRoot}: TransformationContext,
): Promise<TransformResponse> {
  let code =
    config.unstable_disableModuleWrapping === true
      ? JsFileWrapping.jsonToCommonJS(file.code)
      : JsFileWrapping.wrapJson(file.code, config.globalPrefix);
  let map: Array<MetroSourceMapSegmentTuple> = [];

  // TODO: When we can reuse transformJS for JSON, we should not derive `minify` separately.
  const minify =
    options.minify &&
    options.unstable_transformProfile !== 'hermes-canary' &&
    options.unstable_transformProfile !== 'hermes-stable';

  if (minify) {
    ({map, code} = await minifyCode(
      config,
      projectRoot,
      file.filename,
      code,
      file.code,
      map,
    ));
  }

  let jsType: JSFileType;

  if (file.type === 'asset') {
    jsType = 'js/module/asset';
  } else if (file.type === 'script') {
    jsType = 'js/script';
  } else {
    jsType = 'js/module';
  }

  let lineCount;
  ({lineCount, map} = countLinesAndTerminateMap(code, map));
  const output: Array<JsOutput> = [
    {
      data: {code, lineCount, map, functionMap: null},
      type: jsType,
    },
  ];

  return {
    dependencies: [],
    output,
  };
}

function getBabelTransformArgs(
  file: $ReadOnly<{filename: Path, code: string, ...}>,
  {options, config, projectRoot}: TransformationContext,
  plugins?: Plugins = [],
): BabelTransformerArgs {
  const {inlineRequires: _, ...babelTransformerOptions} = options;
  return {
    filename: file.filename,
    options: {
      ...babelTransformerOptions,
      enableBabelRCLookup: config.enableBabelRCLookup,
      enableBabelRuntime: config.enableBabelRuntime,
      globalPrefix: config.globalPrefix,
      hermesParser: config.hermesParser,
      projectRoot,
      publicPath: config.publicPath,
    },
    plugins,
    src: file.code,
  };
}

module.exports = {
  transform: async (
    config: JsTransformerConfig,
    projectRoot: string,
    filename: string,
    data: Buffer,
    options: JsTransformOptions,
  ): Promise<TransformResponse> => {
    const context: TransformationContext = {
      config,
      projectRoot,
      options,
    };
    const sourceCode = data.toString('utf8');

    const {unstable_dependencyMapReservedName} = config;
    if (unstable_dependencyMapReservedName != null) {
      const position = sourceCode.indexOf(unstable_dependencyMapReservedName);
      if (position > -1) {
        throw new SyntaxError(
          'Source code contains the reserved string `' +
            unstable_dependencyMapReservedName +
            '` at character offset ' +
            position,
        );
      }
    }

    if (filename.endsWith('.json')) {
      const jsonFile: JSONFile = {
        filename,
        inputFileSize: data.length,
        code: sourceCode,
        type: options.type,
      };

      return await transformJSON(jsonFile, context);
    }

    if (options.type === 'asset') {
      const file: AssetFile = {
        filename,
        inputFileSize: data.length,
        code: sourceCode,
        type: options.type,
      };

      return await transformAsset(file, context);
    }

    const file: JSFile = {
      filename,
      inputFileSize: data.length,
      code: sourceCode,
      type: options.type === 'script' ? 'js/script' : 'js/module',
      functionMap: null,
    };

    return await transformJSWithBabel(file, context);
  },

  getCacheKey: (config: JsTransformerConfig): string => {
    const {babelTransformerPath, minifierPath, ...remainingConfig} = config;

    const filesKey = getCacheKey([
      __filename,
      require.resolve(babelTransformerPath),
      require.resolve(minifierPath),
      require.resolve('./utils/getMinifier'),
      require.resolve('./utils/assetTransformer'),
      require.resolve('metro/src/ModuleGraph/worker/generateImportNames'),
      require.resolve('metro/src/ModuleGraph/worker/JsFileWrapping'),
      ...metroTransformPlugins.getTransformPluginCacheKeyFiles(),
    ]);

    // $FlowFixMe[unsupported-syntax]
    const babelTransformer = require(babelTransformerPath);
    return [
      filesKey,
      stableHash(remainingConfig).toString('hex'),
      babelTransformer.getCacheKey ? babelTransformer.getCacheKey() : '',
    ].join('$');
  },
};

function countLinesAndTerminateMap(
  code: string,
  map: $ReadOnlyArray<MetroSourceMapSegmentTuple>,
): {
  lineCount: number,
  map: Array<MetroSourceMapSegmentTuple>,
} {
  const NEWLINE = /\r\n?|\n|\u2028|\u2029/g;
  let lineCount = 1;
  let lastLineStart = 0;

  // Count lines and keep track of where the last line starts
  for (const match of code.matchAll(NEWLINE)) {
    lineCount++;
    lastLineStart = match.index + match[0].length;
  }
  const lastLineLength = code.length - lastLineStart;
  const lastLineIndex1Based = lineCount;
  const lastLineNextColumn0Based = lastLineLength;

  // If there isn't a mapping at one-past-the-last column of the last line,
  // add one that maps to nothing. This ensures out-of-bounds lookups hit the
  // null mapping rather than aliasing to whichever mapping happens to be last.
  // ASSUMPTION: Mappings are generated in order of increasing line and column.
  const lastMapping = map[map.length - 1];
  const terminatingMapping = [lastLineIndex1Based, lastLineNextColumn0Based];
  if (
    !lastMapping ||
    lastMapping[0] !== terminatingMapping[0] ||
    lastMapping[1] !== terminatingMapping[1]
  ) {
    return {
      lineCount,
      map: map.concat([terminatingMapping]),
    };
  }
  return {lineCount, map: [...map]};
}
