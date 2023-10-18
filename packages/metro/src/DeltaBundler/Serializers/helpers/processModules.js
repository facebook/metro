/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

'use strict';

import type {Module} from '../../types.flow';

const {isJsModule, wrapModule} = require('./js');

function processModules(
  modules: $ReadOnlyArray<Module<>>,
  {
    filter = () => true,
    createModuleId,
    dev,
    includeAsyncPaths,
    projectRoot,
    serverRoot,
    sourceUrl,
  }: $ReadOnly<{
    filter?: (module: Module<>) => boolean,
    createModuleId: string => number,
    dev: boolean,
    includeAsyncPaths: boolean,
    projectRoot: string,
    serverRoot: string,
    sourceUrl: ?string,
  }>,
): $ReadOnlyArray<[Module<>, string]> {
  return [...modules]
    .filter(isJsModule)
    .filter(filter)
    .map((module: Module<>) => [
      module,
      wrapModule(module, {
        createModuleId,
        dev,
        includeAsyncPaths,
        projectRoot,
        serverRoot,
        sourceUrl,
      }),
    ]);
}

module.exports = processModules;
