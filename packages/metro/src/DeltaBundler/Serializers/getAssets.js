/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const toLocalPath = require('../../node-haste/lib/toLocalPath');

const {getAssetData} = require('../../Assets');
const {getJsOutput, isJsModule} = require('./helpers/js');

import type {AssetData} from '../../Assets';
import type {Graph} from '../types.flow';

type Options = {|
  assetPlugins: $ReadOnlyArray<string>,
  platform: ?string,
  projectRoots: $ReadOnlyArray<string>,
|};

async function getAssets(
  graph: Graph<>,
  options: Options,
): Promise<$ReadOnlyArray<AssetData>> {
  const promises = [];

  for (const module of graph.dependencies.values()) {
    if (isJsModule(module) && getJsOutput(module).type === 'js/module/asset') {
      promises.push(
        getAssetData(
          module.path,
          toLocalPath(options.projectRoots, module.path),
          options.assetPlugins,
          options.platform,
        ),
      );
    }
  }

  return await Promise.all(promises);
}

module.exports = getAssets;
