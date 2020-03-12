/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

'use strict';

import type {IncomingMessage, ServerResponse} from 'http';
import type {CacheStore} from 'metro-cache';
import type {CustomResolver} from 'metro-resolver';
import type {BasicSourceMap, MixedSourceMap} from 'metro-source-map';
import type {
  DeltaResult,
  Graph,
  Module,
  SerializerOptions,
} from 'metro/src/DeltaBundler/types.flow.js';
import type {TransformResult} from 'metro/src/DeltaBundler';
import type {JsTransformerConfig} from 'metro/src/JSTransformer/worker';
import type {TransformVariants} from 'metro/src/ModuleGraph/types.flow.js';
import type Server from 'metro/src/Server';
import type {Reporter} from 'metro/src/lib/reporting';

export type PostMinifyProcess = ({
  code: string,
  map: ?BasicSourceMap,
  ...
}) => {
  code: string,
  map: ?BasicSourceMap,
  ...
};

export type PostProcessBundleSourcemap = ({
  code: Buffer | string,
  map: MixedSourceMap,
  outFileName: string,
  ...
}) => {
  code: Buffer | string,
  map: MixedSourceMap | string,
  ...
};

type ExtraTransformOptions = {
  +preloadedModules: {[path: string]: true, ...} | false,
  +ramGroups: Array<string>,
  +transform: {|
    +experimentalImportSupport: boolean,
    +inlineRequires: {+blacklist: {[string]: true, ...}, ...} | boolean,
    +nonInlinedRequires?: $ReadOnlyArray<string>,
    +unstable_disableES6Transforms?: boolean,
  |},
  ...
};

export type GetTransformOptionsOpts = {|
  dev: boolean,
  hot: boolean,
  platform: ?string,
|};

export type GetTransformOptions = (
  entryPoints: $ReadOnlyArray<string>,
  options: GetTransformOptionsOpts,
  getDependenciesOf: (string) => Promise<Array<string>>,
) => Promise<ExtraTransformOptions>;

export type Middleware = (
  IncomingMessage,
  ServerResponse,
  (e: ?Error) => mixed,
) => mixed;

type ResolverConfigT = {|
  assetExts: $ReadOnlyArray<string>,
  assetResolutions: $ReadOnlyArray<string>,
  blacklistRE: RegExp,
  dependencyExtractor: ?string,
  extraNodeModules: {[name: string]: string, ...},
  hasteImplModulePath: ?string,
  platforms: $ReadOnlyArray<string>,
  resolverMainFields: $ReadOnlyArray<string>,
  resolveRequest: ?CustomResolver,
  sourceExts: $ReadOnlyArray<string>,
  useWatchman: boolean,
|};

type SerializerConfigT = {|
  createModuleIdFactory: () => (path: string) => number,
  customSerializer: ?(
    entryPoint: string,
    preModules: $ReadOnlyArray<Module<>>,
    graph: Graph<>,
    options: SerializerOptions,
  ) => string | {|code: string, map: string|},
  experimentalSerializerHook: (graph: Graph<>, delta: DeltaResult<>) => mixed,
  getModulesRunBeforeMainModule: (entryFilePath: string) => Array<string>,
  getPolyfills: ({platform: ?string, ...}) => $ReadOnlyArray<string>,
  getRunModuleStatement: (number | string) => string,
  polyfillModuleNames: $ReadOnlyArray<string>,
  postProcessBundleSourcemap: PostProcessBundleSourcemap,
  processModuleFilter: (modules: Module<>) => boolean,
|};

type TransformerConfigT = {|
  ...JsTransformerConfig,
  getTransformOptions: GetTransformOptions,
  postMinifyProcess: PostMinifyProcess,
  transformVariants: TransformVariants,
  workerPath: string,
  publicPath: string,
  experimentalImportBundleSupport: false,
|};

type MetalConfigT = {|
  cacheStores: $ReadOnlyArray<CacheStore<TransformResult<>>>,
  cacheVersion: string,
  hasteMapCacheDirectory?: string,
  maxWorkers: number,
  projectRoot: string,
  stickyWorkers: boolean,
  transformerPath: string,
  reporter: Reporter,
  resetCache: boolean,
  watchFolders: $ReadOnlyArray<string>,
|};

type ServerConfigT = {|
  enhanceMiddleware: (Middleware, Server) => Middleware,
  useGlobalHotkey: boolean,
  port: number,
  runInspectorProxy: boolean,
  verifyConnections: boolean,
|};

type SymbolicatorConfigT = {|
  customizeFrame: ({
    +file: ?string,
    +lineNumber: ?number,
    +column: ?number,
    +methodName: ?string,
    ...
  }) => ?{|+collapse?: boolean|} | Promise<?{|+collapse?: boolean|}>,
|};

export type InputConfigT = $Shape<{|
  ...MetalConfigT,
  ...$ReadOnly<{|
    resolver: $Shape<ResolverConfigT>,
    server: $Shape<ServerConfigT>,
    serializer: $Shape<SerializerConfigT>,
    symbolicator: $Shape<SymbolicatorConfigT>,
    transformer: $Shape<TransformerConfigT>,
  |}>,
|}>;

export type IntermediateConfigT = {|
  ...MetalConfigT,
  ...{|
    resolver: ResolverConfigT,
    server: ServerConfigT,
    serializer: SerializerConfigT,
    symbolicator: SymbolicatorConfigT,
    transformer: TransformerConfigT,
  |},
|};

export type ConfigT = $ReadOnly<{|
  ...$ReadOnly<MetalConfigT>,
  ...$ReadOnly<{|
    resolver: $ReadOnly<ResolverConfigT>,
    server: $ReadOnly<ServerConfigT>,
    serializer: $ReadOnly<SerializerConfigT>,
    symbolicator: $ReadOnly<SymbolicatorConfigT>,
    transformer: $ReadOnly<TransformerConfigT>,
  |}>,
|}>;
