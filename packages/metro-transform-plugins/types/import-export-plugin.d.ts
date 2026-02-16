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
import type {Node, SourceLocation, Statement} from '@babel/types';

type Types = typeof $$IMPORT_TYPEOF_1$$;
export type Options = Readonly<{
  importDefault: string;
  importAll: string;
  resolve: boolean;
  out?: {isESModule: boolean};
}>;
type State = {
  exportAll: Array<{file: string; loc: null | undefined | SourceLocation}>;
  exportDefault: Array<{
    local: string;
    loc: null | undefined | SourceLocation;
  }>;
  exportNamed: Array<{
    local: string;
    remote: string;
    loc: null | undefined | SourceLocation;
  }>;
  imports: Array<{node: Statement}>;
  importDefault: Node;
  importAll: Node;
  opts: Options;
};
declare function importExportPlugin($$PARAM_0$$: {
  types: Types;
}): PluginObj<State>;
export default importExportPlugin;
