/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {FBSourceFunctionMap} from './source-map';
import type {PluginObj} from '@babel/core';
import type {Node as BabelNode} from '@babel/types';

type Position = {line: number; column: number};
type RangeMapping = {name: string; start: Position};
export type Context = {filename?: null | undefined | string};
/**
 * Generate a map of source positions to function names. The names are meant to
 * describe the stack frame in an error trace and may contain more contextual
 * information than just the actual name of the function.
 *
 * The output is encoded for use in a source map. For details about the format,
 * see MappingEncoder below.
 */
declare function generateFunctionMap(
  ast: BabelNode,
  context?: Context,
): FBSourceFunctionMap;
/**
 * Same as generateFunctionMap, but returns the raw array of mappings instead
 * of encoding it for use in a source map.
 *
 * Lines are 1-based and columns are 0-based.
 */
declare function generateFunctionMappingsArray(
  ast: BabelNode,
  context?: Context,
): ReadonlyArray<RangeMapping>;
declare function functionMapBabelPlugin(): PluginObj;
export {
  functionMapBabelPlugin,
  generateFunctionMap,
  generateFunctionMappingsArray,
};
