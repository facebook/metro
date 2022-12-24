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

import type {Module, ReadOnlyGraph} from '../types.flow';

const {getAssetFiles} = require('../../Assets');
const {getJsOutput, isJsModule} = require('./helpers/js');

type Options = {
  platform: ?string,
  +processModuleFilter: (module: Module<>) => boolean,
};

async function getAllFiles(
  pre: $ReadOnlyArray<Module<>>,
  graph: ReadOnlyGraph<>,
  options: Options,
): Promise<$ReadOnlyArray<string>> {
  const modules = graph.dependencies;
  const {processModuleFilter} = options;

  const promises: Array<Promise<Array<string>> | Array<string>> = [];

  for (const module of pre) {
    if (processModuleFilter(module)) {
      promises.push([module.path]);
    }
  }

  for (const module of modules.values()) {
    if (!isJsModule(module) || !processModuleFilter(module)) {
      continue;
    }

    if (getJsOutput(module).type === 'js/module/asset') {
      promises.push(getAssetFiles(module.path, options.platform));
    } else {
      promises.push([module.path]);
    }
  }

  const dependencies = await Promise.all(promises);
  const output: Array<string> = [];

  for (const dependencyArray of dependencies) {
    output.push(...dependencyArray);
  }

  return output;
}

module.exports = getAllFiles;
