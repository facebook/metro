/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {ReadonlySourceLocation} from '../../shared/types';
import type {PluginObj} from '@babel/core';
import type * as $$IMPORT_TYPEOF_1$$ from '@babel/types';
import type {MetroBabelFileMetadata} from 'metro-babel-transformer';

type Types = typeof $$IMPORT_TYPEOF_1$$;
type ImportDeclarationLocs = Set<string>;
type State = {
  importDeclarationLocs: ImportDeclarationLocs;
  file: {metadata?: MetroBabelFileMetadata};
};
declare function importLocationsPlugin($$PARAM_0$$: {
  types: Types;
}): PluginObj<State>;
declare function locToKey(loc: ReadonlySourceLocation): string;
export {importLocationsPlugin, locToKey};
