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

import type {AssetData} from '../../Assets';
import type {Graph} from '../DeltaCalculator';

type Options = {|
  assetPlugins: $ReadOnlyArray<string>,
  platform: ?string,
  projectRoots: $ReadOnlyArray<string>,
|};

async function getAssets(
  graph: Graph,
  options: Options,
): Promise<$ReadOnlyArray<AssetData>> {
  const assets = await Promise.all(
    Array.from(graph.dependencies.values()).map(async module => {
      if (module.output.type === 'asset') {
        return getAssetData(
          module.path,
          toLocalPath(options.projectRoots, module.path),
          options.assetPlugins,
          options.platform,
        );
      }
      return null;
    }),
  );

  return assets.filter(Boolean);
}

module.exports = getAssets;
