/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<5fbef54d757c6130889a1889f7d71255>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-source-map/src/Consumer/types.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {IterationOrder, LookupBias} from './constants';
import type {Number0, Number1} from 'ob1';

export type {IterationOrder, LookupBias};
export type GeneratedOffset = {
  readonly lines: Number0;
  readonly columns: Number0;
};
export type SourcePosition = {
  source: null | undefined | string;
  line: null | undefined | Number1;
  column: null | undefined | Number0;
  name: null | undefined | string;
};
export type GeneratedPosition = {
  readonly line: Number1;
  readonly column: Number0;
};
export type GeneratedPositionLookup = {
  readonly line: null | undefined | Number1;
  readonly column: null | undefined | Number0;
  readonly bias?: LookupBias;
};
export type Mapping = Readonly<{
  source: null | undefined | string;
  generatedLine: Number1;
  generatedColumn: Number0;
  originalLine: null | undefined | Number1;
  originalColumn: null | undefined | Number0;
  name: null | undefined | string;
}>;
export interface IConsumer {
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
