/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {MixedSourceMap} from 'metro-source-map';

type SourceNameNormalizer = (
  $$PARAM_0$$: string,
  $$PARAM_1$$: {readonly sourceRoot?: null | undefined | string},
) => string;
/**
  * Consumes the `x_google_ignoreList` metadata field from a source map and
  * exposes various queries on it.
  *
  * By default, source names are normalized using the same logic that the
  * `source-map@0.5.6` package uses internally. This is crucial for keeping the
  * sources list in sync with a `SourceMapConsumer` instance.

  * If you're using this with a different source map reader (e.g. one that
  * doesn't normalize source names at all), you can switch out the normalization
  * function in the constructor, e.g.
  *
  *     new GoogleIgnoreListConsumer(map, source => source) // Don't normalize
  */
declare class GoogleIgnoreListConsumer {
  constructor(map: MixedSourceMap, normalizeSourceFn?: SourceNameNormalizer);
  _sourceMap: MixedSourceMap;
  _normalizeSource: SourceNameNormalizer;
  _ignoredSourceSet: null | undefined | Set<string>;
  /**
   * Returns `true` if the given source is in this map's ignore list, `false`
   * otherwise.
   *
   * When used with the `source-map` package, you'll first use
   * `SourceMapConsumer#originalPositionFor` to retrieve a source location,
   * then pass that location to `isIgnored`.
   */
  isIgnored($$PARAM_0$$: {readonly source: null | undefined | string}): boolean;
  /**
   * Returns this map's ignore list as a new array with indices based on
   * `sources`.
   *
   * This array can be used as the `x_google_ignoreList` field of a map whose
   * `sources` field is the array that was passed into this method.
   */
  toArray(sources: ReadonlyArray<null | undefined | string>): Array<number>;
  /**
   * Prepares and caches a set of ignored sources for this map.
   */
  _getIgnoredSourceSet(): ReadonlySet<string>;
  /**
   * Collects ignored sources from the given map using the current source name
   * normalization function. Handles both index maps (with sections) and plain
   * maps.
   *
   * NOTE: If any sources are repeated in the map, we consider a source to be
   * ignored as long as a source with the same normalized name is listed in AT
   * LEAST one `x_google_ignoreList` array. Technically, this means we lose
   * the granularity afforded by index maps and by the ability to repeat source
   * names within a single `sources` array.
   *
   * Chrome's handling of duplicates is different: only the first occurrence of
   * a given source is considered when determining if a source is ignored. It's
   * unclear whether this is intentional. Absent a formal spec for
   * `x_google_ignoreList`, we will diverge from Chrome for now.
   *
   * See: https://github.com/ChromeDevTools/devtools-frontend/blob/7afc9157b8d05de06e273284119e9c55a4eadb72/front_end/core/sdk/SourceMap.ts#L425-L429
   */
  _buildIgnoredSourceSet(
    map: MixedSourceMap,
    ignoredSourceSet: Set<string>,
  ): void;
}
export default GoogleIgnoreListConsumer;
