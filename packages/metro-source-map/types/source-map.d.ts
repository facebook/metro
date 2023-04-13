/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

export type GeneratedCodeMapping = [number, number];
export type SourceMapping = [number, number, number, number];
export type SourceMappingWithName = [number, number, number, number, string];

export type MetroSourceMapSegmentTuple =
  | SourceMappingWithName
  | SourceMapping
  | GeneratedCodeMapping;

export interface HermesFunctionOffsets {
  [id: number]: ReadonlyArray<number>;
}

export type FBSourcesArray = ReadonlyArray<FBSourceMetadata | null>;
export type FBSourceMetadata = [FBSourceFunctionMap | null];
export interface FBSourceFunctionMap {
  readonly names: ReadonlyArray<string>;
  readonly mappings: string;
}

export interface FBSegmentMap {
  [id: string]: MixedSourceMap;
}

export interface BasicSourceMap {
  readonly file?: string;
  readonly mappings: string;
  readonly names: string[];
  readonly sourceRoot?: string;
  readonly sources: string[];
  readonly sourcesContent?: Array<string | undefined>;
  readonly version: number;
}

export interface IndexMapSection {
  map: IndexMap | BasicSourceMap;
  offset: {
    line: number;
    column: number;
  };
}

export interface IndexMap {
  readonly file?: string;
  readonly mappings?: unknown;
  readonly sourcesContent?: unknown;
  readonly sections: IndexMapSection[];
  readonly version: number;
}

export type MixedSourceMap = IndexMap | BasicSourceMap;
