/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {IndexMap, IndexMapSection, MixedSourceMap} from './source-map';
/**
 * Builds a source-mapped bundle by concatenating strings and their
 * corresponding source maps (if any).
 *
 * Usage:
 *
 * const builder = new BundleBuilder('bundle.js');
 * builder
 *   .append('foo\n', fooMap)
 *   .append('bar\n')
 *   // ...
 * const code = builder.getCode();
 * const map = builder.getMap();
 */
export declare class BundleBuilder {
  _file: string;
  _sections: Array<IndexMapSection>;
  _line: number;
  _column: number;
  _code: string;
  _afterMappedContent: boolean;
  constructor(file: string);
  _pushMapSection(map: MixedSourceMap): void;
  _endMappedContent(): void;
  append(code: string, map: null | undefined | MixedSourceMap): this;
  getMap(): MixedSourceMap;
  getCode(): string;
}
export declare function createIndexMap(
  file: string,
  sections: Array<IndexMapSection>,
): IndexMap;
