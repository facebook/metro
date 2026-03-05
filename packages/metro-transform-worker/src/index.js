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
import type {
  ImportExportPluginOptions,
  InlinePluginOptions,
  InlineRequiresPluginOptions,
} from 'metro-transform-plugins';
import type {TransformResultDependency} from 'metro/private/DeltaBundler';
import type {AllowOptionalDependencies} from 'metro/private/DeltaBundler/types';
import type {
  DependencyTransformer,
  DynamicRequiresBehavior,
} from 'metro/private/ModuleGraph/worker/collectDependencies';

import * as assetTransformer from './utils/assetTransformer';
import getMinifier from './utils/getMinifier';
import {transformFromAstSync, traverse} from '@babel/core';
import generate from '@babel/generator';
import * as babylon from '@babel/parser';
import * as types from '@babel/types';
import {stableHash} from 'metro-cache';
import {getCacheKey as metroGetCacheKey} from 'metro-cache-key';
import {
  fromRawMappings,
  functionMapBabelPlugin,
  toBabelSegments,
  toSegmentTuple,
} from 'metro-source-map';
import metroTransformPlugins from 'metro-transform-plugins';
import collectDependencies from 'metro/private/ModuleGraph/worker/collectDependencies';
import generateImportNames from 'metro/private/ModuleGraph/worker/generateImportNames';
import {
  importLocationsPlugin,
  locToKey,
} from 'metro/private/ModuleGraph/worker/importLocationsPlugin';
import * as JsFileWrapping from 'metro/private/ModuleGraph/worker/JsFileWrapping';
import nullthrows from 'nullthrows';

const InternalInvalidRequireCallError =
  collectDependencies.InvalidRequireCallError;

type MinifierConfig = Readonly<{[string]: unknown, ...}>;

export type MinifierOptions = {
  code: string,
  map: ?BasicSourceMap,
  filename: string,
  reserved: ReadonlyArray<string>,
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

export type JsTransformerConfig = Readonly<{
  assetPlugins: ReadonlyArray<string>,
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
  /** With inlineRequires, enable a module-scope memo var and inline as (v || v=require('foo')) */
  unstable_memoizeInlineRequires?: boolean,
  /** With inlineRequires, do not memoize these module specifiers */
  unstable_nonMemoizedInlineRequires?: ReadonlyArray<string>,
  /** Whether to rename scoped `require` functions to `_$$_REQUIRE`, usually an extraneous operation when serializing to iife (default). */
  unstable_renameRequire?: boolean,
  /** Enable tree shaking (production only). Preserves ESM syntax for deferred finalization. */
  unstable_treeShake?: boolean,
}>;

export type {CustomTransformOptions} from 'metro-babel-transformer';

export type JsTransformOptions = Readonly<{
  customTransformOptions?: CustomTransformOptions,
  dev: boolean,
  experimentalImportSupport?: boolean,
  inlinePlatform: boolean,
  inlineRequires: boolean,
  minify: boolean,
  nonInlinedRequires?: ReadonlyArray<string>,
  platform: ?string,
  type: Type,
  unstable_memoizeInlineRequires?: boolean,
  unstable_nonMemoizedInlineRequires?: ReadonlyArray<string>,
  unstable_staticHermesOptimizedRequire?: boolean,
  unstable_transformProfile: TransformProfile,
  /** Enable tree shaking (production only, forced false in dev). */
  unstable_treeShake?: boolean,
}>;

opaque type Path = string;

type BaseFile = Readonly<{
  code: string,
  filename: Path,
  inputFileSize: number,
}>;

type AssetFile = Readonly<{
  ...BaseFile,
  type: 'asset',
}>;

type JSFileType = 'js/script' | 'js/module' | 'js/module/asset';

type JSFile = Readonly<{
  ...BaseFile,
  ast?: ?BabelNodeFile,
  type: JSFileType,
  functionMap: FBSourceFunctionMap | null,
  unstable_importDeclarationLocs?: ?ReadonlySet<string>,
}>;

type JSONFile = {
  ...BaseFile,
  type: Type,
};

type TransformationContext = Readonly<{
  config: JsTransformerConfig,
  projectRoot: Path,
  options: JsTransformOptions,
}>;

export type JsOutput = Readonly<{
  data: Readonly<{
    code: string,
    lineCount: number,
    map: Array<MetroSourceMapSegmentTuple>,
    functionMap: ?FBSourceFunctionMap,
  }>,
  type: JSFileType,
}>;

type ExportBinding =
  | {type: 'named', name: string, localName: string}
  | {type: 'default', localName: ?string}
  | {type: 'reExportNamed', name: string, as: string, source: string}
  | {type: 'reExportAll', source: string}
  | {type: 'reExportNamespace', as: string, source: string};

export type ModuleSyntaxMeta = {
  exports: ReadonlyArray<ExportBinding>,
  isESModule: boolean,
  directExportNames: ReadonlySet<string>,
  parserPlugins: ReadonlyArray<string | [string, mixed]>,
};

function collectModuleSyntaxMeta(
  ast: BabelNodeFile,
  parserPlugins: ReadonlyArray<string | [string, mixed]>,
): ModuleSyntaxMeta {
  const exportBindings: Array<ExportBinding> = [];
  const directExportNames: Set<string> = new Set();
  let isESModule = false;

  traverse(ast, {
    ImportDeclaration(path: $FlowFixMe) {
      if (
        path.node.importKind !== 'type' &&
        path.node.importKind !== 'typeof'
      ) {
        isESModule = true;
      }
    },
    ExportDefaultDeclaration(path: $FlowFixMe) {
      isESModule = true;
      const decl = path.node.declaration;
      const localName = decl.id?.name ?? null;
      exportBindings.push({type: 'default', localName});
      directExportNames.add('default');
    },
    ExportNamedDeclaration(path: $FlowFixMe) {
      if (
        path.node.exportKind === 'type' ||
        path.node.exportKind === 'typeof'
      ) {
        return;
      }
      isESModule = true;
      if (path.node.source) {
        for (const spec of path.node.specifiers) {
          exportBindings.push({
            type: 'reExportNamed',
            name:
              spec.local.type === 'StringLiteral'
                ? spec.local.value
                : spec.local.name,
            as:
              spec.exported.type === 'StringLiteral'
                ? spec.exported.value
                : spec.exported.name,
            source: path.node.source.value,
          });
        }
      } else if (path.node.declaration) {
        const decl = path.node.declaration;
        if (decl.type === 'VariableDeclaration') {
          for (const declarator of decl.declarations) {
            if (declarator.id.type === 'Identifier') {
              exportBindings.push({
                type: 'named',
                name: declarator.id.name,
                localName: declarator.id.name,
              });
              directExportNames.add(declarator.id.name);
            } else if (declarator.id.type === 'ObjectPattern') {
              for (const prop of declarator.id.properties) {
                if (
                  prop.type === 'ObjectProperty' &&
                  prop.value.type === 'Identifier'
                ) {
                  exportBindings.push({
                    type: 'named',
                    name: prop.value.name,
                    localName: prop.value.name,
                  });
                  directExportNames.add(prop.value.name);
                }
              }
            } else if (declarator.id.type === 'ArrayPattern') {
              for (const element of declarator.id.elements) {
                if (element?.type === 'Identifier') {
                  exportBindings.push({
                    type: 'named',
                    name: element.name,
                    localName: element.name,
                  });
                  directExportNames.add(element.name);
                }
              }
            }
          }
        } else if (decl.id) {
          exportBindings.push({
            type: 'named',
            name: decl.id.name,
            localName: decl.id.name,
          });
          directExportNames.add(decl.id.name);
        }
      } else {
        for (const spec of path.node.specifiers) {
          const name =
            spec.exported.type === 'StringLiteral'
              ? spec.exported.value
              : spec.exported.name;
          exportBindings.push({
            type: 'named',
            name,
            localName:
              spec.local.type === 'StringLiteral'
                ? spec.local.value
                : spec.local.name,
          });
          directExportNames.add(name);
        }
      }
    },
    ExportAllDeclaration(path: $FlowFixMe) {
      if (path.node.exportKind === 'type') {
        return;
      }
      isESModule = true;
      if (path.node.exported != null) {
        const exportedName =
          path.node.exported.type === 'StringLiteral'
            ? path.node.exported.value
            : path.node.exported.name;
        exportBindings.push({
          type: 'reExportNamespace',
          as: exportedName,
          source: path.node.source.value,
        });
        directExportNames.add(exportedName);
      } else {
        exportBindings.push({
          type: 'reExportAll',
          source: path.node.source.value,
        });
      }
    },
  });

  return {
    exports: exportBindings,
    isESModule,
    directExportNames,
    parserPlugins,
  };
}

type TransformResponse = Readonly<{
  dependencies: ReadonlyArray<TransformResultDependency>,
  output: ReadonlyArray<JsOutput>,
  moduleSyntax?: ModuleSyntaxMeta,
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
      inPackages as empty;
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
  reserved?: ReadonlyArray<string> = [],
): Promise<{
  code: string,
  map: Array<MetroSourceMapSegmentTuple>,
  ...
}> => {
  const sourceMap = fromRawMappings([
    {
      code,
      // functionMap is overridden by the serializer
      functionMap: null,
      // isIgnored is overriden by the serializer
      isIgnored: false,
      map,
      path: filename,
      source,
    },
  ]).toMap(undefined, {});

  const minify = getMinifier(config.minifierPath);

  try {
    const minified = await minify({
      code,
      config: config.minifierConfig,
      filename,
      map: sourceMap,
      reserved,
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
  transformIllegalDynamicRequire: () => void 0,
  transformImportCall: () => void 0,
  transformImportMaybeSyncCall: () => void 0,
  transformPrefetch: () => void 0,
  transformSyncRequire: () => void 0,
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

  if (
    options.unstable_treeShake === true &&
    file.type !== 'js/script' &&
    ast.program.sourceType === 'module'
  ) {
    const parserPlugins = getParserPluginsForFile(file.filename);
    const moduleSyntax = collectModuleSyntaxMeta(ast, parserPlugins);

    if (moduleSyntax.isESModule) {
      const esmPlugins: Array<PluginEntry> = [];

      if (options.inlineRequires) {
        esmPlugins.push([
          metroTransformPlugins.inlineRequiresPlugin,
          {
            ignoredRequires: options.nonInlinedRequires,
            inlineableCalls: [importDefault, importAll],
            memoizeCalls:
              // $FlowFixMe[incompatible-type] is this always (?boolean)?
              options.customTransformOptions?.unstable_memoizeInlineRequires ??
              options.unstable_memoizeInlineRequires,
            nonMemoizedModules: options.unstable_nonMemoizedInlineRequires,
          } as InlineRequiresPluginOptions,
        ]);
      }

      esmPlugins.push([
        metroTransformPlugins.inlinePlugin,
        {
          dev: options.dev,
          inlinePlatform: options.inlinePlatform,
          isWrapped: false,
          // $FlowFixMe[incompatible-type] expects a string if inlinePlatform
          platform: options.platform,
        } as InlinePluginOptions,
      ]);

      let esmAst = nullthrows(
        transformFromAstSync(ast, '', {
          ast: true,
          babelrc: false,
          cloneInputAst: true,
          code: false,
          comments: true,
          configFile: false,
          filename: file.filename,
          plugins: esmPlugins,
          sourceMaps: false,
        }).ast,
      );

      if (!options.dev) {
        esmAst = nullthrows(
          transformFromAstSync(esmAst, '', {
            ast: true,
            babelrc: false,
            cloneInputAst: false,
            code: false,
            comments: true,
            configFile: false,
            filename: file.filename,
            plugins: [metroTransformPlugins.constantFoldingPlugin],
            sourceMaps: false,
          }).ast,
        );
      }

      const importDeclarationLocs = file.unstable_importDeclarationLocs ?? null;
      const collectOpts = {
        allowOptionalDependencies: config.allowOptionalDependencies,
        asyncRequireModulePath: config.asyncRequireModulePath,
        dependencyMapName: config.unstable_dependencyMapReservedName,
        dynamicRequires: getDynamicDepsBehavior(
          config.dynamicDepsInPackages,
          file.filename,
        ),
        inlineableCalls: [importDefault, importAll],
        keepRequireNames: options.dev,
        unstable_allowRequireContext: config.unstable_allowRequireContext,
        unstable_isESMImportAtSource:
          importDeclarationLocs != null
            ? (loc: BabelSourceLocation) =>
                importDeclarationLocs.has(locToKey(loc))
            : null,
      };
      let esmDependencies;
      try {
        ({ast: esmAst, dependencies: esmDependencies} = collectDependencies(
          esmAst,
          collectOpts,
        ));
      } catch (error) {
        if (error instanceof InternalInvalidRequireCallError) {
          throw new InvalidRequireCallError(error, file.filename);
        }
        throw error;
      }

      const esmResult = generate(
        esmAst,
        {
          comments: true,
          compact: false,
          filename: file.filename,
          retainLines: false,
          sourceFileName: file.filename,
          sourceMaps: true,
        },
        file.code,
      );

      let esmMap = esmResult.rawMappings
        ? esmResult.rawMappings.map(toSegmentTuple)
        : [];
      const esmCode = esmResult.code;
      let esmLineCount;
      ({lineCount: esmLineCount, map: esmMap} = countLinesAndTerminateMap(
        esmCode,
        esmMap,
      ));

      return {
        dependencies: esmDependencies,
        output: [
          {
            data: {
              code: esmCode,
              functionMap: file.functionMap,
              lineCount: esmLineCount,
              map: esmMap,
            },
            type: file.type,
          },
        ],
        moduleSyntax,
      };
    }
  }

  const plugins: Array<PluginEntry> = [];

  if (options.experimentalImportSupport === true) {
    plugins.push([
      metroTransformPlugins.importExportPlugin,
      {
        importAll,
        importDefault,
        resolve: false,
      } as ImportExportPluginOptions,
    ]);
  }

  if (options.inlineRequires) {
    plugins.push([
      metroTransformPlugins.inlineRequiresPlugin,
      {
        ignoredRequires: options.nonInlinedRequires,
        inlineableCalls: [importDefault, importAll],
        memoizeCalls:
          // $FlowFixMe[incompatible-type] is this always (?boolean)?
          options.customTransformOptions?.unstable_memoizeInlineRequires ??
          options.unstable_memoizeInlineRequires,
        nonMemoizedModules: options.unstable_nonMemoizedInlineRequires,
      } as InlineRequiresPluginOptions,
    ]);
  }

  plugins.push([
    metroTransformPlugins.inlinePlugin,
    {
      dev: options.dev,
      inlinePlatform: options.inlinePlatform,
      isWrapped: false,
      // $FlowFixMe[incompatible-type] expects a string if inlinePlatform
      platform: options.platform,
    } as InlinePluginOptions,
  ]);

  ast = nullthrows(
    transformFromAstSync(ast, '', {
      ast: true,
      babelrc: false,
      // Not-Cloning the input AST here should be safe because other code paths above this call
      // are mutating the AST as well and no code is depending on the original AST.
      // However, switching the flag to false caused issues with ES Modules if `experimentalImportSupport` isn't used https://github.com/facebook/metro/issues/641
      // either because one of the plugins is doing something funky or Babel messes up some caches.
      // Make sure to test the above mentioned case before flipping the flag back to false.
      cloneInputAst: true,
      code: false,
      comments: true,
      configFile: false,
      filename: file.filename,
      plugins,
      sourceMaps: false,
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
        cloneInputAst: false,
        code: false,
        comments: true,
        configFile: false,
        filename: file.filename,
        plugins: [metroTransformPlugins.constantFoldingPlugin],
        sourceMaps: false,
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
      const importDeclarationLocs = file.unstable_importDeclarationLocs ?? null;
      const opts = {
        allowOptionalDependencies: config.allowOptionalDependencies,
        asyncRequireModulePath: config.asyncRequireModulePath,
        dependencyMapName: config.unstable_dependencyMapReservedName,
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
        unstable_allowRequireContext: config.unstable_allowRequireContext,
        unstable_isESMImportAtSource:
          importDeclarationLocs != null
            ? (loc: BabelSourceLocation) =>
                importDeclarationLocs.has(locToKey(loc))
            : null,
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
        // TODO: This config is optional to allow its introduction in a minor
        // release. It should be made non-optional in ConfigT or removed in
        // future.
        config.unstable_renameRequire === false,
        {
          unstable_useStaticHermesModuleFactory: Boolean(
            options.customTransformOptions
              ?.unstable_staticHermesOptimizedRequire,
          ),
        },
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
        functionMap: file.functionMap,
        lineCount,
        map,
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
  const {assetRegistryPath, assetPlugins} = context.config;

  const result = await assetTransformer.transform(
    getBabelTransformArgs(file, context),
    assetRegistryPath,
    assetPlugins,
  );

  const jsFile = {
    ...file,
    ast: result.ast,
    functionMap: null,
    type: 'js/module/asset' as const,
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
    getBabelTransformArgs(file, context, [
      // functionMapBabelPlugin populates metadata.metro.functionMap
      functionMapBabelPlugin,
      // importLocationsPlugin populates metadata.metro.unstable_importDeclarationLocs
      importLocationsPlugin,
    ]),
  );

  const jsFile: JSFile = {
    ...file,
    ast: transformResult.ast,
    functionMap:
      transformResult.metadata?.metro?.functionMap ??
      // Fallback to deprecated explicitly-generated `functionMap`
      transformResult.functionMap ??
      null,
    unstable_importDeclarationLocs:
      transformResult.metadata?.metro?.unstable_importDeclarationLocs,
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
      : JsFileWrapping.wrapJson(
          file.code,
          config.globalPrefix,
          Boolean(
            options.customTransformOptions
              ?.unstable_staticHermesOptimizedRequire,
          ),
        );
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
      data: {code, functionMap: null, lineCount, map},
      type: jsType,
    },
  ];

  return {
    dependencies: [],
    output,
  };
}

function getBabelTransformArgs(
  file: Readonly<{filename: Path, code: string, ...}>,
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

export const transform = async (
  config: JsTransformerConfig,
  projectRoot: string,
  filename: string,
  data: Buffer,
  options: JsTransformOptions,
): Promise<TransformResponse> => {
  const context: TransformationContext = {
    config,
    options,
    projectRoot,
  };
  const sourceCode = data.toString('utf8');

  const reservedStrings = [];
  if (
    options.customTransformOptions?.unstable_staticHermesOptimizedRequire ==
    true
  ) {
    reservedStrings.push('_$$_METRO_MODULE_ID');
  }
  if (config.unstable_dependencyMapReservedName != null) {
    reservedStrings.push(config.unstable_dependencyMapReservedName);
  }
  for (const reservedString of reservedStrings) {
    const position = sourceCode.indexOf(reservedString);
    if (position > -1) {
      throw new SyntaxError(
        'Source code contains the reserved string `' +
          reservedString +
          '` at character offset ' +
          position,
      );
    }
  }

  if (filename.endsWith('.json')) {
    const jsonFile: JSONFile = {
      code: sourceCode,
      filename,
      inputFileSize: data.length,
      type: options.type,
    };

    return await transformJSON(jsonFile, context);
  }

  if (options.type === 'asset') {
    const file: AssetFile = {
      code: sourceCode,
      filename,
      inputFileSize: data.length,
      type: options.type,
    };

    return await transformAsset(file, context);
  }

  const file: JSFile = {
    code: sourceCode,
    filename,
    functionMap: null,
    inputFileSize: data.length,
    type: options.type === 'script' ? 'js/script' : 'js/module',
  };

  return await transformJSWithBabel(file, context);
};

export type UsedExports =
  | {type: 'all'}
  | {type: 'named', names: Set<string>}
  | {type: 'none'};

export type FinalizeOptions = Readonly<{
  usedExports: UsedExports,
  filename: string,
  sourceMap?: ReadonlyArray<MetroSourceMapSegmentTuple>,
  reexportDemandBySource: {[sourceLiteral: string]: ReadonlyArray<string>},
  dependencyMapName: string,
  globalPrefix: string,
  minify: boolean,
  minifierPath: string,
  minifierConfig: MinifierConfig,
  dev: boolean,
  eliminatedReexportSources: {[sourceLiteral: string]: true},
  parserPlugins: ReadonlyArray<string | [string, mixed]>,
}>;

export type FinalizedOutput = {
  code: string,
  map: Array<MetroSourceMapSegmentTuple>,
  lineCount: number,
};

function getParserPluginsForFile(
  filename: string,
): ReadonlyArray<string | [string, mixed]> {
  if (filename.endsWith('.ts')) {
    return ['typescript'];
  }
  if (filename.endsWith('.tsx')) {
    return ['typescript', 'jsx'];
  }
  if (filename.endsWith('.jsx')) {
    return ['flow', 'jsx'];
  }
  return ['flow', 'jsx'];
}

/**
 * Strip the `export` keyword from unused export declarations in an ESM AST.
 * Conservative by design:
 *  - Named declarations: keep the declaration, only remove `export` keyword.
 *  - Re-exports with alive target: downgrade to `import 'x'` (Invariant #8).
 *  - Re-exports with eliminated target: remove entirely (Invariant #11).
 *  - `export *` is narrowed only when per-source demand is provably unambiguous.
 */
function stripUnusedExports(
  ast: BabelNodeFile,
  moduleSyntax: ModuleSyntaxMeta,
  usedExports: UsedExports,
  eliminatedReexportSources: {[sourceLiteral: string]: true},
  reexportDemandBySource: {[sourceLiteral: string]: ReadonlyArray<string>},
): BabelNodeFile {
  const usedNames: Set<string> =
    usedExports.type === 'named' ? usedExports.names : new Set();

  traverse(ast, {
    ExportDefaultDeclaration(path: $FlowFixMe) {
      if (!usedNames.has('default')) {
        const decl = path.node.declaration;
        if (
          decl.type === 'FunctionDeclaration' ||
          decl.type === 'ClassDeclaration'
        ) {
          if (decl.id != null) {
            path.replaceWith(decl);
          } else {
            path.remove();
          }
        } else if (decl.type === 'Identifier') {
          path.remove();
        } else {
          path.replaceWith(types.expressionStatement(decl));
        }
      }
    },

    ExportNamedDeclaration(path: $FlowFixMe) {
      if (path.node.source != null) {
        const sourceName: string = path.node.source.value;
        const keptSpecifiers = path.node.specifiers.filter(
          (spec: $FlowFixMe) => {
            const exported =
              spec.exported.type === 'StringLiteral'
                ? spec.exported.value
                : spec.exported.name;
            return usedNames.has(exported);
          },
        );
        if (keptSpecifiers.length === 0) {
          if (eliminatedReexportSources[sourceName] === true) {
            path.remove();
          } else {
            path.replaceWith(types.importDeclaration([], path.node.source));
          }
        } else {
          path.node.specifiers = keptSpecifiers;
        }
      } else if (path.node.declaration != null) {
        const decl = path.node.declaration;
        const names = getDeclaredNames(decl);
        const anyUsed = names.some((name: string) => usedNames.has(name));
        if (!anyUsed) {
          path.replaceWith(decl);
        }
      } else {
        const keptSpecifiers = path.node.specifiers.filter(
          (spec: $FlowFixMe) => {
            const exported =
              spec.exported.type === 'StringLiteral'
                ? spec.exported.value
                : spec.exported.name;
            return usedNames.has(exported);
          },
        );
        if (keptSpecifiers.length === 0) {
          path.remove();
        } else {
          path.node.specifiers = keptSpecifiers;
        }
      }
    },

    ExportAllDeclaration(path: $FlowFixMe) {
      const sourceName: string = path.node.source.value;
      if (path.node.exported != null) {
        const exportedName: string =
          path.node.exported.type === 'StringLiteral'
            ? path.node.exported.value
            : path.node.exported.name;
        if (!usedNames.has(exportedName)) {
          if (eliminatedReexportSources[sourceName] === true) {
            path.remove();
          } else {
            path.replaceWith(types.importDeclaration([], path.node.source));
          }
        }
      } else {
        if (usedExports.type === 'named') {
          const demanded = reexportDemandBySource[sourceName] ?? [];
          if (demanded.length > 0) {
            const safeToNarrow = demanded.filter(
              (name: string) => !moduleSyntax.directExportNames.has(name),
            );

            if (safeToNarrow.length === 0) {
              return;
            }

            const specifiers: Array<
              | BabelNodeExportSpecifier
              | BabelNodeExportDefaultSpecifier
              | BabelNodeExportNamespaceSpecifier,
            > = [];
            for (const name of safeToNarrow) {
              if (!types.isValidIdentifier(name)) {
                continue;
              }
              const id = types.identifier(name);
              specifiers.push(types.exportSpecifier(id, id));
            }
            if (specifiers.length === 0) {
              return;
            }
            path.replaceWith(
              types.exportNamedDeclaration(
                undefined,
                specifiers,
                path.node.source,
              ),
            );
            return;
          }
        }

        if (usedExports.type === 'none') {
          if (eliminatedReexportSources[sourceName] === true) {
            path.remove();
          } else {
            path.replaceWith(types.importDeclaration([], path.node.source));
          }
        }
      }
    },
  });

  return ast;
}

function getDeclaredNames(decl: $FlowFixMe): Array<string> {
  const names: Array<string> = [];
  if (decl.type === 'VariableDeclaration') {
    for (const declarator of decl.declarations) {
      if (declarator.id.type === 'Identifier') {
        names.push(declarator.id.name);
      } else if (declarator.id.type === 'ObjectPattern') {
        for (const prop of declarator.id.properties) {
          if (
            prop.type === 'ObjectProperty' &&
            prop.value.type === 'Identifier'
          ) {
            names.push(prop.value.name);
          }
        }
      } else if (declarator.id.type === 'ArrayPattern') {
        for (const element of declarator.id.elements) {
          if (element?.type === 'Identifier') {
            names.push(element.name);
          }
        }
      }
    }
  } else if (decl.id != null) {
    names.push(decl.id.name);
  }
  return names;
}

/**
 * Finalize an ESM module for inclusion in the bundle:
 *  1. Parse the ESM code
 *  2. Strip unused exports (conservative)
 *  3. Convert ESM → CJS via import-export-plugin
 *  4. Wrap in __d() factory
 *  5. Generate code
 *  6. Minify (if requested)
 */
export async function finalizeModule(
  code: string,
  moduleSyntax: ModuleSyntaxMeta,
  options: FinalizeOptions,
): Promise<FinalizedOutput> {
  const parsePlugins =
    options.parserPlugins.length > 0
      ? options.parserPlugins
      : getParserPluginsForFile(options.filename);
  // $FlowFixMe[incompatible-call] `parserPlugins` is validated upstream and may include plugin tuples accepted by Babel parser.
  let ast: BabelNodeFile = babylon.parse(code, {
    sourceType: 'module',
    // $FlowFixMe[incompatible-type] parser plugin names/options are valid at runtime but broader than current Flow libdef literals.
    plugins: [...parsePlugins],
  });

  const {importDefault, importAll} = generateImportNames(ast);

  if (options.usedExports.type !== 'all') {
    ast = stripUnusedExports(
      ast,
      moduleSyntax,
      options.usedExports,
      options.eliminatedReexportSources,
      options.reexportDemandBySource,
    );
  }

  const transformPlugins: Array<PluginEntry> = [
    [
      metroTransformPlugins.importExportPlugin,
      {
        importDefault,
        importAll,
        resolve: false,
      } as ImportExportPluginOptions,
    ],
  ];
  if (!options.dev) {
    transformPlugins.push(metroTransformPlugins.constantFoldingPlugin);
  }

  const inputSourceMap =
    options.sourceMap != null
      ? fromRawMappings([
          {
            code,
            functionMap: null,
            isIgnored: false,
            map: options.sourceMap,
            path: options.filename,
            source: code,
          },
        ]).toMap(undefined, {})
      : undefined;

  ast = nullthrows(
    transformFromAstSync(ast, code, {
      ast: true,
      babelrc: false,
      cloneInputAst: false,
      code: false,
      comments: true,
      configFile: false,
      // $FlowFixMe[incompatible-type] Metro source-map shape is accepted by Babel at runtime.
      inputSourceMap,
      plugins: transformPlugins,
      sourceMaps: true,
    }).ast,
  );

  ({ast} = JsFileWrapping.wrapModule(
    ast,
    importDefault,
    importAll,
    options.dependencyMapName,
    options.globalPrefix,
    false,
    {unstable_useStaticHermesModuleFactory: false},
  ));

  const generated = generate(
    ast,
    {
      comments: false,
      compact: true,
      sourceMaps: true,
    },
    code,
  );

  let map = generated.rawMappings
    ? generated.rawMappings.map(toSegmentTuple)
    : [];
  let finalCode = generated.code;

  // Step 6: Minify
  if (options.minify) {
    ({map, code: finalCode} = await minifyCode(
      {
        // Build a minimal config-like object for minifyCode
        minifierPath: options.minifierPath,
        minifierConfig: options.minifierConfig,
        // $FlowFixMe[incompatible-call] these fields are not used by minifyCode
        assetPlugins: [],
        assetRegistryPath: '',
        asyncRequireModulePath: '',
        babelTransformerPath: '',
        dynamicDepsInPackages: 'throwAtRuntime',
        enableBabelRCLookup: false,
        enableBabelRuntime: false,
        globalPrefix: options.globalPrefix,
        hermesParser: false,
        optimizationSizeLimit: Infinity,
        publicPath: '',
        allowOptionalDependencies: false,
        unstable_dependencyMapReservedName: null,
        unstable_disableModuleWrapping: false,
        unstable_disableNormalizePseudoGlobals: false,
        unstable_compactOutput: true,
        unstable_allowRequireContext: false,
      },
      '',
      '',
      finalCode,
      code,
      map,
      options.dependencyMapName != null ? [options.dependencyMapName] : [],
    ));
  }

  let lineCount;
  ({lineCount, map} = countLinesAndTerminateMap(finalCode, map));

  return {code: finalCode, map, lineCount};
}

export const getCacheKey = (config: JsTransformerConfig): string => {
  const {babelTransformerPath, minifierPath, ...remainingConfig} = config;

  const filesKey = metroGetCacheKey([
    __filename,
    require.resolve(babelTransformerPath),
    require.resolve(minifierPath),
    require.resolve('./utils/getMinifier'),
    require.resolve('./utils/assetTransformer'),
    require.resolve('metro/private/ModuleGraph/worker/generateImportNames'),
    require.resolve('metro/private/ModuleGraph/worker/JsFileWrapping'),
    ...metroTransformPlugins.getTransformPluginCacheKeyFiles(),
  ]);

  // $FlowFixMe[unsupported-syntax]
  const babelTransformer = require(babelTransformerPath);
  return [
    filesKey,
    stableHash(remainingConfig).toString('hex'),
    babelTransformer.getCacheKey ? babelTransformer.getCacheKey() : '',
  ].join('$');
};

function countLinesAndTerminateMap(
  code: string,
  map: ReadonlyArray<MetroSourceMapSegmentTuple>,
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

/**
 * Backwards-compatibility with CommonJS consumers using interopRequireDefault.
 * Do not add to this list.
 *
 * @deprecated Default import from 'metro-transform-worker' is deprecated, use named exports.
 */
export default {
  getCacheKey,
  transform,
  finalizeModule,
};
