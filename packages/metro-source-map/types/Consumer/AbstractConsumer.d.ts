/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<22565876862bd94effefabfc09cf8933>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-source-map/src/Consumer/AbstractConsumer.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
