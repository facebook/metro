/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 *
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
