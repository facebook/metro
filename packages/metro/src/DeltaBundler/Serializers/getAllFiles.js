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

const {getAssetFiles} = require('../../Assets');

import type {Graph} from '../DeltaCalculator';
import type {Module} from '../traverseDependencies';

type Options = {|
  platform: ?string,
|};

async function getAllFiles(
  pre: $ReadOnlyArray<Module>,
  graph: Graph,
  options: Options,
): Promise<$ReadOnlyArray<string>> {
  const modules = graph.dependencies;

  const dependencies = await Promise.all(
    [...pre, ...modules.values()].map(async module => {
      if (module.output.type !== 'js/module/asset') {
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

module.exports = getAllFiles;
