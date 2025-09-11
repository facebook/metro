/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {MixedSourceMap} from '../source-map';
import type {LookupBias} from './constants.js';
import type {
  GeneratedPositionLookup,
  IConsumer,
  IterationOrder,
  Mapping,
  SourcePosition,
} from './types';
/**
 * A source map consumer that supports both "basic" and "indexed" source maps.
 * Uses `MappingsConsumer` and `SectionsConsumer` under the hood (via
 * `createConsumer`).
 */
declare class DelegatingConsumer implements IConsumer {
  static readonly GENERATED_ORDER: IterationOrder;
  static readonly ORIGINAL_ORDER: IterationOrder;
  static readonly GREATEST_LOWER_BOUND: LookupBias;
  static readonly LEAST_UPPER_BOUND: LookupBias;
  _rootConsumer: IConsumer;
  constructor(sourceMap: MixedSourceMap);
  originalPositionFor(
    generatedPosition: GeneratedPositionLookup,
  ): SourcePosition;
  generatedMappings(): Iterable<Mapping>;
  eachMapping(
    callback: (mapping: Mapping) => unknown,
    context?: unknown,
    order?: IterationOrder,
  ): void;
  get file(): null | undefined | string;
  sourceContentFor(
    source: string,
    nullOnMissing: true,
  ): null | undefined | string;
}
export default DelegatingConsumer;
