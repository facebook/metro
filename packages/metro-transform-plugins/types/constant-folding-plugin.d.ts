/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
