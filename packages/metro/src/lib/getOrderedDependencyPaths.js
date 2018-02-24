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

const Serializers = require('../DeltaBundler/Serializers');

const {getAssetFiles} = require('../Assets');

import type DeltaBundler from '../DeltaBundler';
import type {BundleOptions} from '../shared/types.flow';

async function getOrderedDependencyPaths(
  deltaBundler: DeltaBundler,
  options: BundleOptions,
): Promise<Array<string>> {
  const modules = await Serializers.getAllModules(deltaBundler, options);

  const dependencies = await Promise.all(
    Array.from(modules.values()).map(async module => {
      if (module.type !== 'asset') {
        return [module.path];
      } else {
        return await getAssetFiles(module.path, options.platform);
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
