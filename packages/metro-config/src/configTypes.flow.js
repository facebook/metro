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

import type {BabelSourceMap} from '@babel/core';
import type {IncomingMessage, ServerResponse} from 'http';
import type {CacheStore} from 'metro-cache';
import type {CustomResolver} from 'metro-resolver';
import type {MetroSourceMap} from 'metro-source-map';
import type {
  DeltaResult,
  Graph,
  Module,
} from 'metro/src/DeltaBundler/types.flow.js';
import type {TransformResult} from 'metro/src/DeltaBundler';
import type {JsTransformerConfig} from 'metro/src/JSTransformer/worker';
import type {TransformVariants} from 'metro/src/ModuleGraph/types.flow.js';
import type {DynamicRequiresBehavior} from 'metro/src/ModuleGraph/worker/collectDependencies';
import type Server from 'metro/src/Server';
import type {Reporter} from 'metro/src/lib/reporting';

export type PostMinifyProcess = ({
  code: string,
  map: ?BabelSourceMap,
}) => {code: string, map: ?BabelSourceMap};

export type PostProcessBundleSourcemap = ({
  code: Buffer | string,
  map: MetroSourceMap,
  outFileName: string,
}) => {code: Buffer | string, map: MetroSourceMap | string};

type ExtraTransformOptions = {
  +preloadedModules: {[path: string]: true} | false,
  +ramGroups: Array<string>,
  +transform: {|
    +experimentalImportSupport: boolean,
    +inlineRequires: {+blacklist: {[string]: true}} | boolean,
  |},
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
  ?() => mixed,
) => mixed;

export type OldConfigT = {
  assetRegistryPath: string,
  cacheStores: Array<CacheStore<TransformResult<>>>,
  cacheVersion: string,
  createModuleIdFactory: () => (path: string) => number,
  enhanceMiddleware: (Middleware, Server) => Middleware,
  extraNodeModules: {[id: string]: string},
  +dynamicDepsInPackages: DynamicRequiresBehavior,
  getAssetExts: () => Array<string>,
  getAsyncRequireModulePath(): string,
  getBlacklistRE(): RegExp,
  getEnableBabelRCLookup(): boolean,
  getModulesRunBeforeMainModule: (entryFilePath: string) => Array<string>,
  getPlatforms: () => Array<string>,
  getPolyfillModuleNames: () => Array<string>,
  getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  getProjectRoots: ?() => Array<string>, // @deprecated
  getProjectRoot: () => string,
  getProvidesModuleNodeModules?: () => Array<string>,
  getResolverMainFields: () => $ReadOnlyArray<string>,
  getRunModuleStatement: (number | string) => string,
  getSourceExts: () => Array<string>,
  getTransformModulePath: () => string,
  getTransformOptions: GetTransformOptions,
  getUseGlobalHotkey: () => boolean,
  getWatchFolders: () => Array<string>,
  getWorkerPath: () => string,
  hasteImplModulePath?: ?string,
  postMinifyProcess: PostMinifyProcess,
  postProcessBundleSourcemap: PostProcessBundleSourcemap,
  processModuleFilter: (modules: Module<>) => boolean,
  resolveRequest: ?CustomResolver,
  transformVariants: () => TransformVariants,
};

type ResolverConfigT = {|
  assetExts: $ReadOnlyArray<string>,
  blacklistRE: RegExp,
  extraNodeModules: {[name: string]: string},
  hasteImplModulePath: ?string,
  platforms: $ReadOnlyArray<string>,
  providesModuleNodeModules: $ReadOnlyArray<string>,
  resolverMainFields: $ReadOnlyArray<string>,
  resolveRequest: ?CustomResolver,
  sourceExts: $ReadOnlyArray<string>,
  useWatchman: boolean,
|};

type SerializerConfigT = {|
  createModuleIdFactory: () => (path: string) => number,
  experimentalSerializerHook: (graph: Graph<>, delta: DeltaResult<>) => mixed,
  getModulesRunBeforeMainModule: (entryFilePath: string) => Array<string>,
  getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
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
|};

type MetalConfigT = {|
  cacheStores: $ReadOnlyArray<CacheStore<TransformResult<>>>,
  cacheVersion: string,
  maxWorkers: number,
  projectRoot: string,
  transformerPath: string,
  reporter: Reporter,
  resetCache: boolean,
  watchFolders: $ReadOnlyArray<string>,
|};

type ServerConfigT = {|
  enableVisualizer: boolean,
  enhanceMiddleware: (Middleware, Server) => Middleware,
  useGlobalHotkey: boolean,
  port: number,
|};

export type InputConfigT = $Shape<{|
  ...MetalConfigT,
  ...$ReadOnly<{|
    resolver: $Shape<ResolverConfigT>,
    server: $Shape<ServerConfigT>,
    serializer: $Shape<SerializerConfigT>,
    transformer: $Shape<TransformerConfigT>,
  |}>,
|}>;

export type IntermediateConfigT = {|
  ...MetalConfigT,
  ...{|
    resolver: ResolverConfigT,
    server: ServerConfigT,
    serializer: SerializerConfigT,
    transformer: TransformerConfigT,
  |},
|};

export type ConfigT = $ReadOnly<{|
  ...$ReadOnly<MetalConfigT>,
  ...$ReadOnly<{|
    resolver: $ReadOnly<ResolverConfigT>,
    server: $ReadOnly<ServerConfigT>,
    serializer: $ReadOnly<SerializerConfigT>,
    transformer: $ReadOnly<TransformerConfigT>,
  |}>,
|}>;
