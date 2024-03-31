/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {DynamicRequiresBehavior} from 'metro';
import type {
  CustomTransformOptions,
  TransformProfile,
} from 'metro-babel-transformer';
import type {
  BasicSourceMap,
  FBSourceFunctionMap,
  MetroSourceMapSegmentTuple,
} from 'metro-source-map';
import type {TransformResultDependency} from 'metro/src/DeltaBundler';
import type {AllowOptionalDependencies} from 'metro/src/DeltaBundler/types';

export type MinifierConfig = Readonly<Record<string, unknown>>;

export interface MinifierOptions {
  code: string;
  map?: BasicSourceMap;
  filename: string;
  reserved: ReadonlyArray<string>;
  config: MinifierConfig;
}

export interface MinifierResult {
  code: string;
  map?: BasicSourceMap;
}

export type Minifier = (
  options: MinifierOptions,
) => MinifierResult | Promise<MinifierResult>;

export type Type = 'script' | 'module' | 'asset';

export type JsTransformerConfig = Readonly<{
  assetPlugins: ReadonlyArray<string>;
  assetRegistryPath: string;
  asyncRequireModulePath: string;
  babelTransformerPath: string;
  dynamicDepsInPackages: DynamicRequiresBehavior;
  enableBabelRCLookup: boolean;
  enableBabelRuntime: boolean;
  globalPrefix: string;
  hermesParser: boolean;
  minifierConfig: MinifierConfig;
  minifierPath: string;
  optimizationSizeLimit: number;
  publicPath: string;
  allowOptionalDependencies: AllowOptionalDependencies;
  unstable_collectDependenciesPath: string;
  unstable_dependencyMapReservedName?: string;
  unstable_disableModuleWrapping: boolean;
  unstable_disableNormalizePseudoGlobals: boolean;
  unstable_compactOutput: boolean;
  /** Enable `require.context` statements which can be used to import multiple files in a directory. */
  unstable_allowRequireContext: boolean;
  /** Whether to rename scoped `require` functions to `_$$_REQUIRE`, usually an extraneous operation when serializing to iife (default). */
  unstable_renameRequire?: boolean;
}>;

export {CustomTransformOptions} from 'metro-babel-transformer';

export type JsTransformOptions = Readonly<{
  customTransformOptions?: CustomTransformOptions;
  dev: boolean;
  experimentalImportSupport?: boolean;
  hot: boolean;
  inlinePlatform: boolean;
  inlineRequires: boolean;
  minify: boolean;
  nonInlinedRequires?: ReadonlyArray<string>;
  platform?: string;
  runtimeBytecodeVersion?: number;
  type: Type;
  unstable_disableES6Transforms?: boolean;
  unstable_transformProfile: TransformProfile;
}>;

export type BytecodeFileType =
  | 'bytecode/module'
  | 'bytecode/module/asset'
  | 'bytecode/script';

export type JSFileType = 'js/script' | 'js/module' | 'js/module/asset';

export type JsOutput = Readonly<{
  data: Readonly<{
    code: string;
    lineCount: number;
    map: MetroSourceMapSegmentTuple[];
    functionMap: FBSourceFunctionMap | null;
  }>;
  type: JSFileType;
}>;

// Hermes byte-code output type
export type BytecodeOutput = unknown;

export type TransformResponse = Readonly<{
  dependencies: ReadonlyArray<TransformResultDependency>;
  output: ReadonlyArray<JsOutput | BytecodeOutput>;
}>;

export function transform(
  config: JsTransformerConfig,
  projectRoot: string,
  filename: string,
  data: Buffer,
  options: JsTransformOptions,
): Promise<TransformResponse>;

export function getCacheKey(config: JsTransformerConfig): string;
