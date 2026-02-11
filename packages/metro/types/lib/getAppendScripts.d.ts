/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
