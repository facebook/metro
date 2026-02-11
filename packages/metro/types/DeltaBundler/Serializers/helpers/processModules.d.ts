/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {Module} from '../../types';

declare function processModules(
  modules: ReadonlyArray<Module>,
  $$PARAM_1$$: Readonly<{
    filter?: (module: Module) => boolean;
    createModuleId: ($$PARAM_0$$: string) => number;
    dev: boolean;
    includeAsyncPaths: boolean;
    projectRoot: string;
    serverRoot: string;
    sourceUrl: null | undefined | string;
  }>,
): ReadonlyArray<[Module, string]>;
export default processModules;
