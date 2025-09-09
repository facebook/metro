/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {IndexMap} from '../source-map';
import type {
  GeneratedOffset,
  GeneratedPositionLookup,
  IConsumer,
  Mapping,
  SourcePosition,
} from './types';

import AbstractConsumer from './AbstractConsumer';
/**
 * A source map consumer that supports "indexed" source maps (that have a
 * `sections` field and no top-level mappings).
 */
declare class SectionsConsumer extends AbstractConsumer implements IConsumer {
  _consumers: ReadonlyArray<[GeneratedOffset, IConsumer]>;
  constructor(sourceMap: IndexMap);
  originalPositionFor(
    generatedPosition: GeneratedPositionLookup,
  ): SourcePosition;
  generatedMappings(): Iterable<Mapping>;
  _consumerForPosition(
    generatedPosition: GeneratedPositionLookup,
  ): null | undefined | [GeneratedOffset, IConsumer];
  sourceContentFor(
    source: string,
    nullOnMissing: true,
  ): null | undefined | string;
}
export default SectionsConsumer;
