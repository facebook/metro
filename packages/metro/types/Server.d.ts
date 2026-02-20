/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {AssetData} from './Assets';
import type {ExplodedSourceMap} from './DeltaBundler/Serializers/getExplodedSourceMap';
import type {RamBundleInfo} from './DeltaBundler/Serializers/getRamBundleInfo';
import type {
  Module,
  ReadOnlyDependencies,
  ReadOnlyGraph,
  TransformInputOptions,
} from './DeltaBundler/types';
import type {RevisionId} from './IncrementalBundler';
import type {GraphId} from './lib/getGraphId';
import type {Reporter} from './lib/reporting';
import type {
  BuildOptions,
  BundleOptions,
  GraphOptions,
  ResolverInputOptions,
  SplitBundleOptions,
} from './shared/types';
import type {IncomingMessage} from 'connect';
import type {ServerResponse} from 'http';
import type {ConfigT, RootPerfLogger} from 'metro-config';
import type {
  ActionLogEntryData,
  ActionStartLogEntry,
} from 'metro-core/private/Logger';
import type {CustomResolverOptions} from 'metro-resolver/private/types';
import type {CustomTransformOptions} from 'metro-transform-worker';

import IncrementalBundler from './IncrementalBundler';
import MultipartResponse from './Server/MultipartResponse';
import {SourcePathsMode} from './shared/types';
import {Logger} from 'metro-core';

export type SegmentLoadData = {
  [$$Key$$: number]: [Array<number>, null | undefined | number];
};
export type BundleMetadata = {
  hash: string;
  otaBuildNumber: null | undefined | string;
  mobileConfigs: Array<string>;
  segmentHashes: Array<string>;
  segmentLoadData: SegmentLoadData;
};
type ProcessStartContext = Omit<
  SplitBundleOptions,
  keyof {
    readonly buildNumber: number;
    readonly bundleOptions: BundleOptions;
    readonly graphId: GraphId;
    readonly graphOptions: GraphOptions;
    readonly mres: MultipartResponse | ServerResponse;
    readonly req: IncomingMessage;
    readonly revisionId?: null | undefined | RevisionId;
    readonly bundlePerfLogger: RootPerfLogger;
    readonly requestStartTimestamp: number;
  }
> & {
  readonly buildNumber: number;
  readonly bundleOptions: BundleOptions;
  readonly graphId: GraphId;
  readonly graphOptions: GraphOptions;
  readonly mres: MultipartResponse | ServerResponse;
  readonly req: IncomingMessage;
  readonly revisionId?: null | undefined | RevisionId;
  readonly bundlePerfLogger: RootPerfLogger;
  readonly requestStartTimestamp: number;
};
type ProcessDeleteContext = {
  readonly graphId: GraphId;
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
};
type ProcessEndContext<T> = Omit<
  ProcessStartContext,
  keyof {readonly result: T}
> & {readonly result: T};
export type ServerOptions = Readonly<{
  hasReducedPerformance?: boolean;
  onBundleBuilt?: (bundlePath: string) => void;
  watch?: boolean;
}>;
type FetchTiming = {
  graphId: GraphId;
  startTime: number;
  endTime: number | null;
  isPrefetch: boolean;
};
declare class Server {
  _bundler: IncrementalBundler;
  _config: ConfigT;
  _createModuleId: (path: string) => number;
  _isEnded: boolean;
  _logger: typeof Logger;
  _nextBundleBuildNumber: number;
  _platforms: Set<string>;
  _reporter: Reporter;
  _serverOptions: ServerOptions | void;
  _allowedSuffixesForSourceRequests: ReadonlyArray<string>;
  _sourceRequestRoutingMap: ReadonlyArray<
    [pathnamePrefix: string, normalizedRootDir: string]
  >;
  _fetchTimings: Array<FetchTiming>;
  _activeFetchCount: number;
  constructor(config: ConfigT, options?: ServerOptions);
  end(): void;
  getBundler(): IncrementalBundler;
  getCreateModuleId(): (path: string) => number;
  _serializeGraph(
    $$PARAM_0$$: Readonly<{
      splitOptions: SplitBundleOptions;
      prepend: ReadonlyArray<Module>;
      graph: ReadOnlyGraph;
    }>,
  ): Promise<{code: string; map: string}>;
  build(
    bundleOptions: BundleOptions,
    $$PARAM_1$$?: BuildOptions,
  ): Promise<{code: string; map: string; assets?: ReadonlyArray<AssetData>}>;
  getRamBundleInfo(options: BundleOptions): Promise<RamBundleInfo>;
  getAssets(options: BundleOptions): Promise<ReadonlyArray<AssetData>>;
  _getAssetsFromDependencies(
    dependencies: ReadOnlyDependencies,
    platform: null | undefined | string,
  ): Promise<ReadonlyArray<AssetData>>;
  getOrderedDependencyPaths(options: {
    readonly dev: boolean;
    readonly entryFile: string;
    readonly minify: boolean;
    readonly platform: null | undefined | string;
  }): Promise<Array<string>>;
  _rangeRequestMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    data: string | Buffer,
    assetPath: string,
  ): Buffer | string;
  _processSingleAssetRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void>;
  processRequest: (
    $$PARAM_0$$: IncomingMessage,
    $$PARAM_1$$: ServerResponse,
    $$PARAM_2$$: (e: null | undefined | Error) => void,
  ) => void;
  _parseOptions(url: string): BundleOptions;
  _rewriteAndNormalizeUrl(requestUrl: string): string;
  _processRequest(
    req: IncomingMessage,
    res: ServerResponse,
    next: ($$PARAM_0$$: null | undefined | Error) => void,
  ): Promise<void>;
  _processSourceRequest(
    relativeFilePathname: string,
    rootDir: string,
    res: ServerResponse,
  ): Promise<void>;
  _createRequestProcessor<T>($$PARAM_0$$: {
    readonly bundleType: 'assets' | 'bundle' | 'map';
    readonly createStartEntry: (
      context: ProcessStartContext,
    ) => ActionLogEntryData;
    readonly createEndEntry: (
      context: ProcessEndContext<T>,
    ) => Partial<ActionStartLogEntry>;
    readonly build: (context: ProcessStartContext) => Promise<T>;
    readonly delete?: (context: ProcessDeleteContext) => Promise<void>;
    readonly finish: (context: ProcessEndContext<T>) => void;
  }): (
    req: IncomingMessage,
    res: ServerResponse,
    bundleOptions: BundleOptions,
    buildContext: Readonly<{
      buildNumber: number;
      bundlePerfLogger: RootPerfLogger;
    }>,
  ) => Promise<void>;
  _processBundleRequest: (
    req: IncomingMessage,
    res: ServerResponse,
    bundleOptions: BundleOptions,
    buildContext: Readonly<{
      buildNumber: number;
      bundlePerfLogger: RootPerfLogger;
    }>,
  ) => Promise<void>;
  _getSortedModules(graph: ReadOnlyGraph): ReadonlyArray<Module>;
  _processSourceMapRequest: (
    req: IncomingMessage,
    res: ServerResponse,
    bundleOptions: BundleOptions,
    buildContext: Readonly<{
      buildNumber: number;
      bundlePerfLogger: RootPerfLogger;
    }>,
  ) => Promise<void>;
  _processAssetsRequest: (
    req: IncomingMessage,
    res: ServerResponse,
    bundleOptions: BundleOptions,
    buildContext: Readonly<{
      buildNumber: number;
      bundlePerfLogger: RootPerfLogger;
    }>,
  ) => Promise<void>;
  _symbolicate(req: IncomingMessage, res: ServerResponse): Promise<void>;
  _explodedSourceMapForBundleOptions(
    bundleOptions: BundleOptions,
  ): Promise<ExplodedSourceMap>;
  _resolveRelativePath(
    filePath: string,
    $$PARAM_1$$: Readonly<{
      relativeTo: 'project' | 'server';
      resolverOptions: ResolverInputOptions;
      transformOptions: TransformInputOptions;
    }>,
  ): Promise<string>;
  getNewBuildNumber(): number;
  getPlatforms(): ReadonlyArray<string>;
  getWatchFolders(): ReadonlyArray<string>;
  static DEFAULT_GRAPH_OPTIONS: Readonly<{
    customResolverOptions: CustomResolverOptions;
    customTransformOptions: CustomTransformOptions;
    dev: boolean;
    minify: boolean;
    unstable_transformProfile: 'default';
  }>;
  static DEFAULT_BUNDLE_OPTIONS: Omit<
    typeof Server.DEFAULT_GRAPH_OPTIONS,
    keyof {
      excludeSource: false;
      inlineSourceMap: false;
      lazy: false;
      modulesOnly: false;
      onProgress: null;
      runModule: true;
      shallow: false;
      sourceMapUrl: null;
      sourceUrl: null;
      sourcePaths: SourcePathsMode;
    }
  > & {
    excludeSource: false;
    inlineSourceMap: false;
    lazy: false;
    modulesOnly: false;
    onProgress: null;
    runModule: true;
    shallow: false;
    sourceMapUrl: null;
    sourceUrl: null;
    sourcePaths: SourcePathsMode;
  };
  _getServerRootDir(): string;
  _getEntryPointAbsolutePath(entryFile: string): string;
  ready(): Promise<void>;
  _shouldAddModuleToIgnoreList(module: Module): boolean;
  _getModuleSourceUrl(module: Module, mode: SourcePathsMode): string;
}
export default Server;
