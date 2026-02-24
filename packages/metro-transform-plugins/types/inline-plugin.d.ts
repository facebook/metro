/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<0a0f52c4e23d8cd25d04b2d46a09e480>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-transform-plugins/src/inline-plugin.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {PluginObj} from '@babel/core';
import type * as $$IMPORT_TYPEOF_1$$ from '@babel/types';

type Types = typeof $$IMPORT_TYPEOF_1$$;
export type Options = Readonly<{
  dev: boolean;
  inlinePlatform: boolean;
  isWrapped: boolean;
  requireName?: string;
  platform: string;
}>;
type State = {opts: Options};
declare function inlinePlugin(
  $$PARAM_0$$: {types: Types},
  options: Options,
): PluginObj<State>;
export default inlinePlugin;
