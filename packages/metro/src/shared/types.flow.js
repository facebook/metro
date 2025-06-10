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

import type {
  Options as DeltaBundlerOptions,
  TransformInputOptions,
} from '../DeltaBundler/types.flow';
import type {TransformProfile} from 'metro-babel-transformer';
import type {CustomResolverOptions} from 'metro-resolver';
import type {
  MetroSourceMapSegmentTuple,
  MixedSourceMap,
} from 'metro-source-map';
import type {
  CustomTransformOptions,
  MinifierOptions,
} from 'metro-transform-worker';

type MetroSourceMapOrMappings =
  | MixedSourceMap
  | Array<MetroSourceMapSegmentTuple>;

export enum SourcePathsMode {
  /* Use absolute paths for source files in source maps (default). */
  Absolute = 'absolute',
  /* Use server-relative URL paths for source files in source maps. */
  ServerUrl = 'url-server',
}

export type BundleOptions = {
  +customResolverOptions: CustomResolverOptions,
  customTransformOptions: CustomTransformOptions,
  dev: boolean,
  entryFile: string,
  +excludeSource: boolean,
  +hot: boolean,
  +inlineSourceMap: boolean,
  +lazy: boolean,
  minify: boolean,
  +modulesOnly: boolean,
  onProgress: ?(doneCont: number, totalCount: number) => mixed,
  +platform: ?string,
  +runModule: boolean,
  +shallow: boolean,
  sourceMapUrl: ?string,
  sourceUrl: ?string,
  createModuleIdFactory?: () => (path: string) => number,
  +unstable_transformProfile: TransformProfile,
  +sourcePaths: SourcePathsMode,
};

export type ResolverInputOptions = $ReadOnly<{
  customResolverOptions?: CustomResolverOptions,
  dev: boolean,
}>;

export type SerializerOptions = {
  +sourceMapUrl: ?string,
  +sourceUrl: ?string,
  +runModule: boolean,
  +excludeSource: boolean,
  +inlineSourceMap: boolean,
  +modulesOnly: boolean,
  +sourcePaths: SourcePathsMode,
};

export type GraphOptions = {
  +lazy: boolean,
  +shallow: boolean,
};

// Stricter representation of BundleOptions.
export type SplitBundleOptions = {
  +entryFile: string,
  +resolverOptions: ResolverInputOptions,
  +transformOptions: TransformInputOptions,
  +serializerOptions: SerializerOptions,
  +graphOptions: GraphOptions,
  +onProgress: DeltaBundlerOptions<>['onProgress'],
};

export type ModuleGroups = {
  groups: Map<number, Set<number>>,
  modulesById: Map<number, ModuleTransportLike>,
  modulesInGroups: Set<number>,
};

export type ModuleTransportLike = {
  +code: string,
  +id: number,
  +map: ?MetroSourceMapOrMappings,
  +name?: string,
  +sourcePath: string,
  ...
};
export type ModuleTransportLikeStrict = {
  +code: string,
  +id: number,
  +map: ?MetroSourceMapOrMappings,
  +name?: string,
  +sourcePath: string,
};
export type RamModuleTransport = {
  ...ModuleTransportLikeStrict,
  +source: string,
  +type: string,
};

export type OutputOptions = {
  bundleOutput: string,
  bundleEncoding?: 'utf8' | 'utf16le' | 'ascii',
  dev?: boolean,
  indexedRamBundle?: boolean,
  platform: string,
  sourcemapOutput?: string,
  sourcemapSourcesRoot?: string,
  sourcemapUseAbsolutePath?: boolean,
  ...
};

export type RequestOptions = {
  entryFile: string,
  inlineSourceMap?: boolean,
  sourceMapUrl?: string,
  dev?: boolean,
  minify: boolean,
  platform: string,
  createModuleIdFactory?: () => (path: string) => number,
  onProgress?: (transformedFileCount: number, totalFileCount: number) => void,
  +customResolverOptions?: CustomResolverOptions,
  +customTransformOptions?: CustomTransformOptions,
  +unstable_transformProfile?: TransformProfile,
};

export type {MinifierOptions};
