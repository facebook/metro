/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
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
import typeof MetroCache from 'metro-cache';
import type {CacheManagerFactory} from 'metro-file-map';
import type {CustomResolver} from 'metro-resolver';
import type {JsTransformerConfig} from 'metro-transform-worker';
import type {TransformResult} from 'metro/src/DeltaBundler';

import type {
  DeltaResult,
  Module,
  ReadOnlyGraph,
  SerializerOptions,
} from 'metro/src/DeltaBundler/types.flow.js';
import type {Reporter} from 'metro/src/lib/reporting';
import type Server from 'metro/src/Server';
import type {IntermediateStackFrame} from '../../metro/src/Server/symbolicate';

export type ExtraTransformOptions = {
  +preloadedModules?: {[path: string]: true, ...} | false,
  +ramGroups?: Array<string>,
  +transform?: {
    +experimentalImportSupport?: boolean,
    +inlineRequires?: {+blockList: {[string]: true, ...}, ...} | boolean,
    +nonInlinedRequires?: $ReadOnlyArray<string>,
    +unstable_disableES6Transforms?: boolean,
  },
  ...
};

export type GetTransformOptionsOpts = {
  dev: boolean,
  hot: boolean,
  platform: ?string,
};

export type GetTransformOptions = (
  entryPoints: $ReadOnlyArray<string>,
  options: GetTransformOptionsOpts,
  getDependenciesOf: (string) => Promise<Array<string>>,
) => Promise<Partial<ExtraTransformOptions>>;

export type Middleware = (
  IncomingMessage,
  ServerResponse,
  ((e: ?Error) => mixed),
) => mixed;

type PerfAnnotations = Partial<{
  string: {[key: string]: string},
  int: {[key: string]: number},
  double: {[key: string]: number},
  bool: {[key: string]: boolean},
  string_array: {[key: string]: Array<string>},
  int_array: {[key: string]: Array<number>},
  double_array: {[key: string]: Array<number>},
  bool_array: {[key: string]: Array<boolean>},
}>;

type PerfLoggerPointOptions = $ReadOnly<{
  // The time this event point occurred, if it differs from the time the point was logged.
  timestamp?: number,
}>;

export interface PerfLogger {
  point(name: string, opts?: PerfLoggerPointOptions): void;
  annotate(annotations: PerfAnnotations): void;
  subSpan(label: string): PerfLogger;
}

export interface RootPerfLogger extends PerfLogger {
  start(opts?: PerfLoggerPointOptions): void;
  end(
    status: 'SUCCESS' | 'FAIL' | 'CANCEL',
    opts?: PerfLoggerPointOptions,
  ): void;
}

export type PerfLoggerFactoryOptions = $ReadOnly<{
  key?: number,
}>;

export type PerfLoggerFactory = (
  type: 'START_UP' | 'BUNDLING_REQUEST' | 'HMR',
  opts?: PerfLoggerFactoryOptions,
) => RootPerfLogger;

type ResolverConfigT = {
  assetExts: $ReadOnlyArray<string>,
  assetResolutions: $ReadOnlyArray<string>,
  blacklistRE?: RegExp | Array<RegExp>,
  blockList: RegExp | Array<RegExp>,
  disableHierarchicalLookup: boolean,
  dependencyExtractor: ?string,
  emptyModulePath: string,
  unstable_enableSymlinks: boolean,
  extraNodeModules: {[name: string]: string, ...},
  hasteImplModulePath: ?string,
  nodeModulesPaths: $ReadOnlyArray<string>,
  platforms: $ReadOnlyArray<string>,
  resolveRequest: ?CustomResolver,
  resolverMainFields: $ReadOnlyArray<string>,
  sourceExts: $ReadOnlyArray<string>,
  unstable_conditionNames: $ReadOnlyArray<string>,
  unstable_conditionsByPlatform: $ReadOnly<{
    [platform: string]: $ReadOnlyArray<string>,
  }>,
  unstable_enablePackageExports: boolean,
  useWatchman: boolean,
  requireCycleIgnorePatterns: $ReadOnlyArray<RegExp>,
};

type SerializerConfigT = {
  createModuleIdFactory: () => (path: string) => number,
  customSerializer: ?(
    entryPoint: string,
    preModules: $ReadOnlyArray<Module<>>,
    graph: ReadOnlyGraph<>,
    options: SerializerOptions,
  ) => Promise<string | {code: string, map: string}>,
  experimentalSerializerHook: (
    graph: ReadOnlyGraph<>,
    delta: DeltaResult<>,
  ) => mixed,
  getModulesRunBeforeMainModule: (entryFilePath: string) => Array<string>,
  getPolyfills: ({platform: ?string, ...}) => $ReadOnlyArray<string>,
  getRunModuleStatement: (number | string) => string,
  polyfillModuleNames: $ReadOnlyArray<string>,
  processModuleFilter: (modules: Module<>) => boolean,
  isThirdPartyModule: (module: $ReadOnly<{path: string, ...}>) => boolean,
};

type TransformerConfigT = {
  ...JsTransformerConfig,
  getTransformOptions: GetTransformOptions,
  // TODO(moti): Remove this Meta-internal option from Metro's public config
  transformVariants: {+[name: string]: {...}},
  workerPath: string,
  publicPath: string,
};

type MetalConfigT = {
  cacheStores: $ReadOnlyArray<CacheStore<TransformResult<>>>,
  cacheVersion: string,
  fileMapCacheDirectory?: string,
  hasteMapCacheDirectory?: string, // Deprecated, alias of fileMapCacheDirectory
  unstable_fileMapCacheManagerFactory?: CacheManagerFactory,
  maxWorkers: number,
  unstable_perfLoggerFactory?: ?PerfLoggerFactory,
  projectRoot: string,
  stickyWorkers: boolean,
  transformerPath: string,
  reporter: Reporter,
  resetCache: boolean,
  watchFolders: $ReadOnlyArray<string>,
};

type ServerConfigT = {
  enhanceMiddleware: (Middleware, Server) => Middleware,
  port: number,
  rewriteRequestUrl: string => string,
  runInspectorProxy: boolean,
  unstable_serverRoot: ?string,
  useGlobalHotkey: boolean,
  verifyConnections: boolean,
};

type SymbolicatorConfigT = {
  customizeFrame: ({
    +file: ?string,
    +lineNumber: ?number,
    +column: ?number,
    +methodName: ?string,
    ...
  }) => ?{+collapse?: boolean} | Promise<?{+collapse?: boolean}>,
  customizeStack: (
    Array<IntermediateStackFrame>,
    mixed,
  ) => Array<IntermediateStackFrame> | Promise<Array<IntermediateStackFrame>>,
};

type WatcherConfigT = {
  additionalExts: $ReadOnlyArray<string>,
  healthCheck: {
    enabled: boolean,
    interval: number,
    timeout: number,
    filePrefix: string,
  },
  watchman: {
    deferStates: $ReadOnlyArray<string>,
  },
};

export type InputConfigT = Partial<{
  ...MetalConfigT,
  ...$ReadOnly<{
    cacheStores:
      | $ReadOnlyArray<CacheStore<TransformResult<>>>
      | (MetroCache => $ReadOnlyArray<CacheStore<TransformResult<>>>),
    resolver: $ReadOnly<Partial<ResolverConfigT>>,
    server: $ReadOnly<Partial<ServerConfigT>>,
    serializer: $ReadOnly<Partial<SerializerConfigT>>,
    symbolicator: $ReadOnly<Partial<SymbolicatorConfigT>>,
    transformer: $ReadOnly<Partial<TransformerConfigT>>,
    watcher: $ReadOnly<
      Partial<{
        ...WatcherConfigT,
        healthCheck?: $ReadOnly<Partial<WatcherConfigT['healthCheck']>>,
      }>,
    >,
  }>,
}>;

export type MetroConfig = InputConfigT;

export type IntermediateConfigT = {
  ...MetalConfigT,
  ...{
    resolver: ResolverConfigT,
    server: ServerConfigT,
    serializer: SerializerConfigT,
    symbolicator: SymbolicatorConfigT,
    transformer: TransformerConfigT,
    watcher: WatcherConfigT,
  },
};

export type ConfigT = $ReadOnly<{
  ...$ReadOnly<MetalConfigT>,
  ...$ReadOnly<{
    resolver: $ReadOnly<ResolverConfigT>,
    server: $ReadOnly<ServerConfigT>,
    serializer: $ReadOnly<SerializerConfigT>,
    symbolicator: $ReadOnly<SymbolicatorConfigT>,
    transformer: $ReadOnly<TransformerConfigT>,
    watcher: $ReadOnly<WatcherConfigT>,
  }>,
}>;

export type YargArguments = $ReadOnly<{
  config?: string,
  cwd?: string,
  port?: string | number,
  host?: string,
  projectRoot?: string,
  watchFolders?: Array<string>,
  assetExts?: Array<string>,
  sourceExts?: Array<string>,
  platforms?: Array<string>,
  'max-workers'?: string | number,
  maxWorkers?: string | number,
  transformer?: string,
  'reset-cache'?: boolean,
  resetCache?: boolean,
  runInspectorProxy?: boolean,
  verbose?: boolean,
  ...
}>;
