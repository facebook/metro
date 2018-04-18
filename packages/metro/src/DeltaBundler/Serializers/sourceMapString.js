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
import type {Module} from '../traverseDependencies';

function fullSourceMap(
  pre: $ReadOnlyArray<Module>,
  graph: Graph,
  options: {|+excludeSource: boolean|},
): string {
  const modules = [...pre, ...graph.dependencies.values()].map(module => {
    return {
      ...module.output,
      path: module.path,
    };
  });

  return fromRawMappings(modules).toString(undefined, {
    excludeSource: options.excludeSource,
  });
}

module.exports = fullSourceMap;
