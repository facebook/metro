/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<ef37054bf63dff008ccc8b58a2411597>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/ModuleGraph/worker/JsFileWrapping.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {File as BabelNodeFile} from '@babel/types';

declare const WRAP_NAME: '$$_REQUIRE';
declare function wrapModule(
  fileAst: BabelNodeFile,
  importDefaultName: string,
  importAllName: string,
  dependencyMapName: string,
  globalPrefix: string,
  skipRequireRename: boolean,
  $$PARAM_6$$?: Readonly<{unstable_useStaticHermesModuleFactory?: boolean}>,
): {ast: BabelNodeFile; requireName: string};
declare function wrapPolyfill(fileAst: BabelNodeFile): BabelNodeFile;
declare function jsonToCommonJS(source: string): string;
declare function wrapJson(
  source: string,
  globalPrefix: string,
  unstable_useStaticHermesModuleFactory?: boolean,
): string;
export {WRAP_NAME, wrapJson, jsonToCommonJS, wrapModule, wrapPolyfill};
