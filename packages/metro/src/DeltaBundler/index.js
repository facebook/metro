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

const DeltaCalculator = require('./DeltaCalculator');

import type Bundler from '../Bundler';
import type {
  DeltaResult,
  Graph as CalculatorGraph,
  Options,
} from './DeltaCalculator';

export type Delta = DeltaResult;
export type Graph = CalculatorGraph;

/**
 * `DeltaBundler` uses the `DeltaTransformer` to build bundle deltas. This
 * module handles all the transformer instances so it can support multiple
 * concurrent clients requesting their own deltas. This is done through the
 * `clientId` param (which maps a client to a specific delta transformer).
 */
class DeltaBundler {
  _bundler: Bundler;
  _deltaCalculators: Map<Graph, DeltaCalculator> = new Map();

  constructor(bundler: Bundler) {
    this._bundler = bundler;
  }

  end() {
    this._deltaCalculators.forEach(deltaCalculator => deltaCalculator.end());
    this._deltaCalculators = new Map();
  }

  async buildGraph(options: Options): Promise<Graph> {
    const depGraph = await this._bundler.getDependencyGraph();

    const deltaCalculator = new DeltaCalculator(
      this._bundler,
      depGraph,
      options,
    );

    await deltaCalculator.getDelta({reset: true});
    const graph = deltaCalculator.getGraph();

    this._deltaCalculators.set(graph, deltaCalculator);

    return graph;
  }

  async getDelta(graph: Graph, {reset}: {reset: boolean}): Promise<Delta> {
    const deltaCalculator = this._deltaCalculators.get(graph);

    if (!deltaCalculator) {
      throw new Error('Graph not found');
    }

    return await deltaCalculator.getDelta({reset});
  }

  listen(graph: Graph, callback: () => mixed) {
    const deltaCalculator = this._deltaCalculators.get(graph);

    if (!deltaCalculator) {
      throw new Error('Graph not found');
    }

    deltaCalculator.on('change', callback);
  }

  endGraph(graph: Graph) {
    const deltaCalculator = this._deltaCalculators.get(graph);

    if (!deltaCalculator) {
      throw new Error('Graph not found');
    }

    deltaCalculator.end();

    this._deltaCalculators.delete(graph);
  }
}

module.exports = DeltaBundler;
