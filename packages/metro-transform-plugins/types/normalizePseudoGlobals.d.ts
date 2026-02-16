/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {Node as BabelNode} from '@babel/types';

export type Options = {reservedNames: ReadonlyArray<string>};
declare function normalizePseudoglobals(
  ast: BabelNode,
  options?: Options,
): ReadonlyArray<string>;
export default normalizePseudoglobals;
