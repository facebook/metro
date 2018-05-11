/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */
'use strict';

import type {
  GetTransformOptions,
  PostMinifyProcess,
  PostProcessBundleSourcemap,
} from '../Bundler';
import type {TransformResult} from '../DeltaBundler';
import type {CustomTransformOptions} from '../JSTransformer/worker';
import type {DynamicRequiresBehavior} from '../ModuleGraph/worker/collectDependencies';
import type {Reporter} from '../lib/reporting';
import type {CacheStore} from 'metro-cache';
import type {CustomResolver} from 'metro-resolver';
import type {
  MetroSourceMap,
  MetroSourceMapSegmentTuple,
} from 'metro-source-map';

type BundleType =
  | 'bundle'
  | 'delta'
  | 'map'
  | 'ram'
  | 'cli'
  | 'hmr'
  | 'todo'
  | 'graph';
type MetroSourceMapOrMappings =
  | MetroSourceMap
  | Array<MetroSourceMapSegmentTuple>;

export type BundleOptions = {
  +assetPlugins: Array<string>,
  bundleType: BundleType,
  customTransformOptions: CustomTransformOptions,
  dev: boolean,
  entryFile: string,
  +entryModuleOnly: boolean,
  +excludeSource: boolean,
  +hot: boolean,
  +inlineSourceMap: boolean,
  minify: boolean,
  onProgress: ?(doneCont: number, totalCount: number) => mixed,
  +platform: ?string,
  +runBeforeMainModule: Array<string>,
  +runModule: boolean,
  sourceMapUrl: ?string,
  createModuleIdFactory?: () => (path: string) => number,
};

export type ModuleGroups = {|
  groups: Map<number, Set<number>>,
  modulesById: Map<number, ModuleTransportLike>,
  modulesInGroups: Set<number>,
|};

export type ModuleTransportLike = {
  +code: string,
  +id: number,
  +map: ?MetroSourceMapOrMappings,
  +name?: string,
  +sourcePath: string,
};

export type Options = {|
  // TODO: Remove this option below (T23793920)
  assetTransforms?: boolean,
  assetExts?: Array<string>,
  +asyncRequireModulePath: string,
  +assetRegistryPath: string,
  blacklistRE?: RegExp,
  cacheStores: $ReadOnlyArray<CacheStore<TransformResult<>>>,
  cacheVersion: string,
  createModuleIdFactory?: () => (path: string) => number,
  +dynamicDepsInPackages: DynamicRequiresBehavior,
  enableBabelRCLookup: boolean,
  extraNodeModules?: {},
  getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  +getRunModuleStatement: (number | string) => string,
  getTransformOptions?: GetTransformOptions,
  hasteImplModulePath?: string,
  maxWorkers?: number,
  minifierPath?: string,
  platforms?: Array<string>,
  polyfillModuleNames?: Array<string>,
  postMinifyProcess: PostMinifyProcess,
  postProcessBundleSourcemap: PostProcessBundleSourcemap,
  projectRoots: $ReadOnlyArray<string>,
  providesModuleNodeModules?: Array<string>,
  reporter?: Reporter,
  resetCache?: boolean,
  resolveRequest: ?CustomResolver,
  +getModulesRunBeforeMainModule: (entryPoint: string) => Array<string>,
  silent?: boolean,
  +sourceExts: ?Array<string>,
  transformModulePath?: string,
  watch?: boolean,
  workerPath: ?string,
|};

export type OutputOptions = {
  bundleOutput: string,
  bundleEncoding?: 'utf8' | 'utf16le' | 'ascii',
  dev?: boolean,
  platform: string,
  sourcemapOutput?: string,
  sourcemapSourcesRoot?: string,
  sourcemapUseAbsolutePath?: boolean,
};

export type RequestOptions = {|
  entryFile: string,
  inlineSourceMap?: boolean,
  sourceMapUrl?: string,
  dev?: boolean,
  minify: boolean,
  platform: string,
  createModuleIdFactory?: () => (path: string) => number,
  onProgress?: (transformedFileCount: number, totalFileCount: number) => void,
|};
