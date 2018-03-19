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

const {fromRawMappings} = require('metro-source-map');

import type {Graph} from '../DeltaCalculator';
import type {DependencyEdge} from '../traverseDependencies';

function fullSourceMap(
  pre: $ReadOnlyArray<DependencyEdge>,
  graph: Graph,
  options: {|+excludeSource: boolean|},
): string {
  const modules = pre.concat(...graph.dependencies.values());

  const modulesWithMaps = modules.map(module => {
    return {
      ...module.output,
      path: module.path,
    };
  });

  return fromRawMappings(modulesWithMaps).toString(undefined, {
    excludeSource: options.excludeSource,
  });
}

module.exports = fullSourceMap;
