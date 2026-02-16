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
