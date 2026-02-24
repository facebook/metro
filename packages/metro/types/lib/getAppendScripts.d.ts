/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<72fd04e53dc895f1305e10043f986edc>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/getAppendScripts.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Module} from '../DeltaBundler';

type Options<T extends number | string> = Readonly<{
  asyncRequireModulePath: string;
  createModuleId: ($$PARAM_0$$: string) => T;
  getRunModuleStatement: (moduleId: T, globalPrefix: string) => string;
  globalPrefix: string;
  inlineSourceMap: null | undefined | boolean;
  runBeforeMainModule: ReadonlyArray<string>;
  runModule: boolean;
  shouldAddToIgnoreList: ($$PARAM_0$$: Module) => boolean;
  sourceMapUrl: null | undefined | string;
  sourceUrl: null | undefined | string;
  getSourceUrl: null | undefined | (($$PARAM_0$$: Module) => string);
}>;
declare function getAppendScripts<T extends number | string>(
  entryPoint: string,
  modules: ReadonlyArray<Module>,
  options: Options<T>,
): ReadonlyArray<Module>;
export default getAppendScripts;
