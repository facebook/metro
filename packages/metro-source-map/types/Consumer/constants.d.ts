/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {Number0, Number1} from 'ob1';

declare const FIRST_COLUMN: Number0;
declare const FIRST_LINE: Number1;
export declare type IterationOrder = symbol & {__IterationOrder__: string};
declare const GENERATED_ORDER: IterationOrder;
declare const ORIGINAL_ORDER: IterationOrder;
export declare type LookupBias = symbol & {__LookupBias__: string};
declare const GREATEST_LOWER_BOUND: LookupBias;
declare const LEAST_UPPER_BOUND: LookupBias;
declare const EMPTY_POSITION: Readonly<{
  source: null;
  name: null;
  line: null;
  column: null;
}>;
declare function iterationOrderToString(x: IterationOrder): string;
declare function lookupBiasToString(x: LookupBias): string;
export {
  FIRST_COLUMN,
  FIRST_LINE,
  GENERATED_ORDER,
  ORIGINAL_ORDER,
  GREATEST_LOWER_BOUND,
  LEAST_UPPER_BOUND,
  EMPTY_POSITION,
  iterationOrderToString,
  lookupBiasToString,
};
