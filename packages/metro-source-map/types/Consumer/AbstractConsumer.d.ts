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
  GeneratedPositionLookup,
  IConsumer,
  IterationOrder,
  Mapping,
  SourcePosition,
} from './types';

declare class AbstractConsumer implements IConsumer {
  _sourceMap: {readonly file?: string};
  constructor(sourceMap: {readonly file?: string});
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
export default AbstractConsumer;
