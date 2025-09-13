/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {IConsumer} from './Consumer/types';

import {BundleBuilder, createIndexMap} from './BundleBuilder';
import composeSourceMaps from './composeSourceMaps';
import Consumer from './Consumer';
import normalizeSourcePath from './Consumer/normalizeSourcePath';
import {
  functionMapBabelPlugin,
  generateFunctionMap,
} from './generateFunctionMap';
import Generator from './Generator';

export type {IConsumer};
type GeneratedCodeMapping = [number, number];
type SourceMapping = [number, number, number, number];
type SourceMappingWithName = [number, number, number, number, string];
export type MetroSourceMapSegmentTuple =
  | SourceMappingWithName
  | SourceMapping
  | GeneratedCodeMapping;
export type HermesFunctionOffsets = {
  [$$Key$$: number]: ReadonlyArray<number>;
};
export type FBSourcesArray = ReadonlyArray<null | undefined | FBSourceMetadata>;
export type FBSourceMetadata = [null | undefined | FBSourceFunctionMap];
export type FBSourceFunctionMap = {
  readonly names: ReadonlyArray<string>;
  readonly mappings: string;
};
export type BabelSourceMapSegment = Readonly<{
  generated: Readonly<{column: number; line: number}>;
  original?: Readonly<{column: number; line: number}>;
  source?: null | undefined | string;
  name?: null | undefined | string;
}>;
export type FBSegmentMap = {[id: string]: MixedSourceMap};
export type BasicSourceMap = {
  readonly file?: string;
  readonly mappings: string;
  readonly names: Array<string>;
  readonly sourceRoot?: string;
  readonly sources: Array<string>;
  readonly sourcesContent?: Array<null | undefined | string>;
  readonly version: number;
  readonly x_facebook_offsets?: Array<number>;
  readonly x_metro_module_paths?: Array<string>;
  readonly x_facebook_sources?: FBSourcesArray;
  readonly x_facebook_segments?: FBSegmentMap;
  readonly x_hermes_function_offsets?: HermesFunctionOffsets;
  readonly x_google_ignoreList?: Array<number>;
};
export type IndexMapSection = {
  map: IndexMap | BasicSourceMap;
  offset: {line: number; column: number};
};
export type IndexMap = {
  readonly file?: string;
  readonly mappings?: void;
  readonly sourcesContent?: void;
  readonly sections: Array<IndexMapSection>;
  readonly version: number;
  readonly x_facebook_offsets?: Array<number>;
  readonly x_metro_module_paths?: Array<string>;
  readonly x_facebook_sources?: void;
  readonly x_facebook_segments?: FBSegmentMap;
  readonly x_hermes_function_offsets?: HermesFunctionOffsets;
  readonly x_google_ignoreList?: void;
};
export type MixedSourceMap = IndexMap | BasicSourceMap;
/**
 * Creates a source map from modules with "raw mappings", i.e. an array of
 * tuples with either 2, 4, or 5 elements:
 * generated line, generated column, source line, source line, symbol name.
 * Accepts an `offsetLines` argument in case modules' code is to be offset in
 * the resulting bundle, e.g. by some prefix code.
 */
declare function fromRawMappings(
  modules: ReadonlyArray<{
    readonly map: null | undefined | ReadonlyArray<MetroSourceMapSegmentTuple>;
    readonly functionMap: null | undefined | FBSourceFunctionMap;
    readonly path: string;
    readonly source: string;
    readonly code: string;
    readonly isIgnored: boolean;
    readonly lineCount?: number;
  }>,
  offsetLines?: number,
): Generator;
declare function fromRawMappingsNonBlocking(
  modules: ReadonlyArray<{
    readonly map: null | undefined | ReadonlyArray<MetroSourceMapSegmentTuple>;
    readonly functionMap: null | undefined | FBSourceFunctionMap;
    readonly path: string;
    readonly source: string;
    readonly code: string;
    readonly isIgnored: boolean;
    readonly lineCount?: number;
  }>,
  offsetLines?: number,
): Promise<Generator>;
/**
 * Transforms a standard source map object into a Raw Mappings object, to be
 * used across the bundler.
 */
declare function toBabelSegments(
  sourceMap: BasicSourceMap,
): Array<BabelSourceMapSegment>;
declare function toSegmentTuple(
  mapping: BabelSourceMapSegment,
): MetroSourceMapSegmentTuple;
export {
  BundleBuilder,
  composeSourceMaps,
  Consumer,
  createIndexMap,
  generateFunctionMap,
  fromRawMappings,
  fromRawMappingsNonBlocking,
  functionMapBabelPlugin,
  normalizeSourcePath,
  toBabelSegments,
  toSegmentTuple,
};
/**
 * Backwards-compatibility with CommonJS consumers using interopRequireDefault.
 * Do not add to this list.
 *
 * @deprecated Default import from 'metro-source-map' is deprecated, use named exports.
 */
declare const $$EXPORT_DEFAULT_DECLARATION$$: {
  BundleBuilder: typeof BundleBuilder;
  composeSourceMaps: typeof composeSourceMaps;
  Consumer: typeof Consumer;
  createIndexMap: typeof createIndexMap;
  generateFunctionMap: typeof generateFunctionMap;
  fromRawMappings: typeof fromRawMappings;
  fromRawMappingsNonBlocking: typeof fromRawMappingsNonBlocking;
  functionMapBabelPlugin: typeof functionMapBabelPlugin;
  normalizeSourcePath: typeof normalizeSourcePath;
  toBabelSegments: typeof toBabelSegments;
  toSegmentTuple: typeof toSegmentTuple;
};
declare type $$EXPORT_DEFAULT_DECLARATION$$ =
  typeof $$EXPORT_DEFAULT_DECLARATION$$;
export default $$EXPORT_DEFAULT_DECLARATION$$;
