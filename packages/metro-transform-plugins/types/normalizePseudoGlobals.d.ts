/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<318e20b6680fabe0b8524213e38e0277>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-transform-plugins/src/normalizePseudoGlobals.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Node as BabelNode} from '@babel/types';

export type Options = {reservedNames: ReadonlyArray<string>};
declare function normalizePseudoglobals(
  ast: BabelNode,
  options?: Options,
): ReadonlyArray<string>;
export default normalizePseudoglobals;
