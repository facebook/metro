/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<e2a6c983e649fe98c57dec4cc2e0aa65>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-source-map/src/Consumer/MappingsConsumer.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {BasicSourceMap} from '../source-map';
import type {
  GeneratedPositionLookup,
  IConsumer,
  Mapping,
  SourcePosition,
} from './types';
import type {Number0} from 'ob1';

import AbstractConsumer from './AbstractConsumer';
/**
 * A source map consumer that supports "basic" source maps (that have a
 * `mappings` field and no sections).
 */
declare class MappingsConsumer extends AbstractConsumer implements IConsumer {
  _sourceMap: BasicSourceMap;
  _decodedMappings: null | undefined | ReadonlyArray<Mapping>;
  _normalizedSources: null | undefined | ReadonlyArray<string>;
  constructor(sourceMap: BasicSourceMap);
  originalPositionFor(
    generatedPosition: GeneratedPositionLookup,
  ): SourcePosition;
  _decodeMappings(): Generator<Mapping, void, void>;
  _normalizeAndCacheSources(): ReadonlyArray<string>;
  _decodeAndCacheMappings(): ReadonlyArray<Mapping>;
  generatedMappings(): Iterable<Mapping>;
  _indexOfSource(source: string): null | undefined | Number0;
  sourceContentFor(
    source: string,
    nullOnMissing: true,
  ): null | undefined | string;
}
export default MappingsConsumer;
