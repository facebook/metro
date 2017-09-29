/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const Serializers = require('../DeltaBundler/Serializers');

const toLocalPath = require('../node-haste/lib/toLocalPath');

import type AssetsServer from '../AssetServer';
import type {Options} from '../DeltaBundler/Serializers';
import type DeltaBundler from '../DeltaBundler';

async function getOrderedDependencyPaths(
  deltaBundler: DeltaBundler,
  assetsServer: AssetsServer,
  projectRoots: $ReadOnlyArray<string>,
  options: Options,
): Promise<Array<string>> {
  const modules = await Serializers.getAllModules(deltaBundler, options);

  const dependencies = await Promise.all(
    Array.from(modules.values()).map(async module => {
      if (module.type !== 'asset') {
        return [module.path];
      } else {
        const assetData = await assetsServer.getAssetData(
          toLocalPath(projectRoots, module.path),
          options.platform,
        );

        return assetData.files;
      }
    }),
  );

  const output = [];
  for (const dependencyArray of dependencies) {
    output.push(...dependencyArray);
  }
  return output;
}

module.exports = getOrderedDependencyPaths;
