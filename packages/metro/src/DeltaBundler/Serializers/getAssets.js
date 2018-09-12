/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const toLocalPath = require('../../node-haste/lib/toLocalPath');

const {getAssetData} = require('../../Assets');
const {getJsOutput, isJsModule} = require('./helpers/js');

import type {AssetData} from '../../Assets';
import type {Graph, Module} from '../types.flow';

type Options = {|
  +processModuleFilter: (module: Module<>) => boolean,
  assetPlugins: $ReadOnlyArray<string>,
  platform: ?string,
  watchFolders: $ReadOnlyArray<string>,
|};

async function getAssets(
  graph: Graph<>,
  options: Options,
): Promise<$ReadOnlyArray<AssetData>> {
  const promises = [];
  const {processModuleFilter} = options;

  for (const module of graph.dependencies.values()) {
    if (
      isJsModule(module) &&
      processModuleFilter(module) &&
      getJsOutput(module).type === 'js/module/asset'
    ) {
      promises.push(
        getAssetData(
          module.path,
          toLocalPath(options.watchFolders, module.path),
          options.assetPlugins,
          options.platform,
        ),
      );
    }
  }

  return await Promise.all(promises);
}

module.exports = getAssets;
