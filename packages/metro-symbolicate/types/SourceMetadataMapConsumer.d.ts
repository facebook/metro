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
  FBSourceMetadata,
  FBSourcesArray,
  MixedSourceMap,
} from 'metro-source-map';

type Position = {readonly line: number; readonly column: number};
type FunctionMapping = {
  readonly line: number;
  readonly column: number;
  readonly name: string;
};
type SourceNameNormalizer = (
  $$PARAM_0$$: string,
  $$PARAM_1$$: {readonly sourceRoot?: null | undefined | string},
) => string;
type MetadataMap = {[source: string]: null | undefined | FBSourceMetadata};
/**
 * Consumes the `x_facebook_sources` metadata field from a source map and
 * exposes various queries on it.
 *
 * By default, source names are normalized using the same logic that the
 * `source-map@0.5.6` package uses internally. This is crucial for keeping the
 * sources list in sync with a `SourceMapConsumer` instance.

 * If you're using this with a different source map reader (e.g. one that
 * doesn't normalize source names at all), you can switch out the normalization
 * function in the constructor, e.g.
 *
 *     new SourceMetadataMapConsumer(map, source => source) // Don't normalize
 */
declare class SourceMetadataMapConsumer {
  constructor(map: MixedSourceMap, normalizeSourceFn?: SourceNameNormalizer);
  _sourceMap: MixedSourceMap;
  _decodedFunctionMapCache: Map<
    string,
    null | undefined | ReadonlyArray<FunctionMapping>
  >;
  _normalizeSource: SourceNameNormalizer;
  _metadataBySource: null | undefined | MetadataMap;
  /**
   * Retrieves a human-readable name for the function enclosing a particular
   * source location.
   *
   * When used with the `source-map` package, you'll first use
   * `SourceMapConsumer#originalPositionFor` to retrieve a source location,
   * then pass that location to `functionNameFor`.
   */
  functionNameFor(
    $$PARAM_0$$: Position & {readonly source: null | undefined | string},
  ): null | undefined | string;
  /**
   * Returns this map's source metadata as a new array with the same order as
   * `sources`.
   *
   * This array can be used as the `x_facebook_sources` field of a map whose
   * `sources` field is the array that was passed into this method.
   */
  toArray(sources: ReadonlyArray<string>): FBSourcesArray;
  /**
   * Prepares and caches a lookup table of metadata by source name.
   */
  _getMetadataBySource(): MetadataMap;
  /**
   * Decodes the function name mappings for the given source if needed, and
   * retrieves a sorted, searchable array of mappings.
   */
  _getFunctionMappings(
    source: string,
  ): null | undefined | ReadonlyArray<FunctionMapping>;
  /**
   * Collects source metadata from the given map using the current source name
   * normalization function. Handles both index maps (with sections) and plain
   * maps.
   *
   * NOTE: If any sources are repeated in the map (which shouldn't happen in
   * Metro, but is technically possible because of index maps) we only keep the
   * metadata from the last occurrence of any given source.
   */
  _getMetadataObjectsBySourceNames(map: MixedSourceMap): MetadataMap;
}
export default SourceMetadataMapConsumer;
