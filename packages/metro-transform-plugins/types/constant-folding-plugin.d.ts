/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<126e200dfee829750f4424e550c34190>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-transform-plugins/src/constant-folding-plugin.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {PluginObj} from '@babel/core';
import type $$IMPORT_TYPEOF_1$$ from '@babel/traverse';
import type * as $$IMPORT_TYPEOF_2$$ from '@babel/types';

type Traverse = typeof $$IMPORT_TYPEOF_1$$;
type Types = typeof $$IMPORT_TYPEOF_2$$;
type State = {stripped: boolean};
declare function constantFoldingPlugin(context: {
  types: Types;
  traverse: Traverse;
}): PluginObj<State>;
export default constantFoldingPlugin;
