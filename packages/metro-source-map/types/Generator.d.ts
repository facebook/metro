/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {
  BasicSourceMap,
  FBSourceFunctionMap,
  FBSourceMetadata,
} from './source-map';

import B64Builder from './B64Builder';

type FileFlags = Readonly<{addToIgnoreList?: boolean}>;
/**
 * Generates a source map from raw mappings.
 *
 * Raw mappings are a set of 2, 4, or five elements:
 *
 * - line and column number in the generated source
 * - line and column number in the original source
 * - symbol name in the original source
 *
 * Mappings have to be passed in the order appearance in the generated source.
 */
declare class Generator {
  builder: B64Builder;
  last: {
    generatedColumn: number;
    generatedLine: number;
    name: number;
    source: number;
    sourceColumn: number;
    sourceLine: number;
  };
  names: IndexedSet;
  source: number;
  sources: Array<string>;
  sourcesContent: Array<null | undefined | string>;
  x_facebook_sources: Array<null | undefined | FBSourceMetadata>;
  x_google_ignoreList: Array<number>;
  constructor();
  /**
   * Mark the beginning of a new source file.
   */
  startFile(
    file: string,
    code: string,
    functionMap: null | undefined | FBSourceFunctionMap,
    flags?: FileFlags,
  ): void;
  /**
   * Mark the end of the current source file
   */
  endFile(): void;
  /**
   * Adds a mapping for generated code without a corresponding source location.
   */
  addSimpleMapping(generatedLine: number, generatedColumn: number): void;
  /**
   * Adds a mapping for generated code with a corresponding source location.
   */
  addSourceMapping(
    generatedLine: number,
    generatedColumn: number,
    sourceLine: number,
    sourceColumn: number,
  ): void;
  /**
   * Adds a mapping for code with a corresponding source location + symbol name.
   */
  addNamedSourceMapping(
    generatedLine: number,
    generatedColumn: number,
    sourceLine: number,
    sourceColumn: number,
    name: string,
  ): void;
  /**
   * Return the source map as object.
   */
  toMap(file?: string, options?: {excludeSource?: boolean}): BasicSourceMap;
  /**
   * Return the source map as string.
   *
   * This is ~2.5x faster than calling `JSON.stringify(generator.toMap())`
   */
  toString(file?: string, options?: {excludeSource?: boolean}): string;
  /**
   * Determine whether we need to write the `x_facebook_sources` field.
   * If the metadata is all `null`s, we can omit the field entirely.
   */
  hasSourcesMetadata(): boolean;
}
export default Generator;
declare class IndexedSet {
  map: Map<string, number>;
  nextIndex: number;
  constructor();
  indexFor(x: string): number;
  items(): Array<string>;
}
