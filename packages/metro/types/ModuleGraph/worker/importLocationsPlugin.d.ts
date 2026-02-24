/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<644d25f2f9682a306271d052d09b1d2d>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/ModuleGraph/worker/importLocationsPlugin.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
