/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */
'use strict';

import type {
  CustomTransformOptions,
  MinifierOptions,
} from '../JSTransformer/worker';
import type {BabelSourceMap} from '@babel/core';
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

export type {MinifierOptions};

export type MinifierResult = {
  code: string,
  map?: BabelSourceMap,
};

export type MetroMinifier = MinifierOptions => MinifierResult;
