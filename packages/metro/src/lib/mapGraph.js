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

import type {DependencyEdge} from '../DeltaBundler/traverseDependencies';
import type {Graph} from '../DeltaBundler';

/**
 * Generates a new Graph object, which has all the dependencies returned by the
 * mapping function (similar to Array.prototype.map).
 **/
async function mapGraph(
  graph: Graph,
  mappingFn: DependencyEdge => Promise<DependencyEdge>,
): Promise<Graph> {
  const dependencies = new Map(
    await Promise.all(
      Array.from(graph.dependencies.entries()).map(async ([path, module]) => {
        const mutated = await mappingFn(module);

        return [path, mutated];
      }),
    ),
  );

  return {
    dependencies,
    entryPoints: graph.entryPoints,
  };
}

module.exports = mapGraph;
