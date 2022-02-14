/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

import type {AssetData} from '../../Assets';
import type {Dependencies, Module} from '../types.flow';

const {getAssetData} = require('../../Assets');
const {getJsOutput, isJsModule} = require('./helpers/js');
const path = require('path');

type Options = {|
  +processModuleFilter: (module: Module<>) => boolean,
  assetPlugins: $ReadOnlyArray<string>,
  platform: ?string,
  projectRoot: string,
  publicPath: string,
|};

async function getAssets(
  dependencies: Dependencies<>,
  options: Options,
): Promise<$ReadOnlyArray<AssetData>> {
  const promises = [];
  const {processModuleFilter} = options;

  for (const module of dependencies.values()) {
    if (
      isJsModule(module) &&
      processModuleFilter(module) &&
      getJsOutput(module).type === 'js/module/asset' &&
      path.relative(options.projectRoot, module.path) !== 'package.json'
    ) {
      promises.push(
        getAssetData(
          module.path,
          path.relative(options.projectRoot, module.path),
          options.assetPlugins,
          options.platform,
          options.publicPath,
        ),
      );
    }
  }

  return await Promise.all(promises);
}

module.exports = getAssets;
