/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
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
import type {PostProcessModules} from '../DeltaBundler';
import type {GlobalTransformCache} from '../lib/GlobalTransformCache';
import type {TransformCache} from '../lib/TransformCaching';
import type {Reporter} from '../lib/reporting';
import type {HasteImpl} from '../node-haste/Module';
import type {
  MetroSourceMap,
  MetroSourceMapSegmentTuple,
} from 'metro-source-map';

type BundleType = 'bundle' | 'delta' | 'map' | 'ram' | 'cli' | 'hmr' | 'todo';
type MetroSourceMapOrMappings =
  | MetroSourceMap
  | Array<MetroSourceMapSegmentTuple>;

export type BundleOptions = {
  +assetPlugins: Array<string>,
  bundleType: BundleType,
  dev: boolean,
  entryFile: string,
  +entryModuleOnly: boolean,
  +excludeSource: boolean,
  +hot: boolean,
  +inlineSourceMap: boolean,
  +isolateModuleIDs: boolean,
  minify: boolean,
  onProgress: ?(doneCont: number, totalCount: number) => mixed,
  +platform: ?string,
  +resolutionResponse: ?{},
  +runBeforeMainModule: Array<string>,
  +runModule: boolean,
  sourceMapUrl: ?string,
  unbundle: boolean,
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
  +assetRegistryPath: string,
  blacklistRE?: RegExp,
  cacheVersion?: string,
  createModuleIdFactory?: () => (path: string) => number,
  enableBabelRCLookup?: boolean,
  extraNodeModules?: {},
  getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,
  getTransformOptions?: GetTransformOptions,
  globalTransformCache: ?GlobalTransformCache,
  hasteImpl?: HasteImpl,
  maxWorkers?: number,
  moduleFormat?: string,
  platforms?: Array<string>,
  polyfillModuleNames?: Array<string>,
  postProcessModules?: PostProcessModules,
  postMinifyProcess: PostMinifyProcess,
  postProcessBundleSourcemap: PostProcessBundleSourcemap,
  projectRoots: $ReadOnlyArray<string>,
  providesModuleNodeModules?: Array<string>,
  reporter?: Reporter,
  resetCache?: boolean,
  +getModulesRunBeforeMainModule: (entryPoint: string) => Array<string>,
  silent?: boolean,
  +sourceExts: ?Array<string>,
  +transformCache: TransformCache,
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
|};
