/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {
  DeltaResult,
  Graph,
  MixedOutput,
  Options,
  ReadOnlyGraph,
} from './DeltaBundler/types';
import type EventEmitter from 'events';

import DeltaCalculator from './DeltaBundler/DeltaCalculator';

export type {
  DeltaResult,
  Graph,
  Dependencies,
  MixedOutput,
  Module,
  ReadOnlyGraph,
  TransformFn,
  TransformResult,
  TransformResultDependency,
  TransformResultWithSource,
} from './DeltaBundler/types';
/**
 * `DeltaBundler` uses the `DeltaTransformer` to build bundle deltas. This
 * module handles all the transformer instances so it can support multiple
 * concurrent clients requesting their own deltas. This is done through the
 * `clientId` param (which maps a client to a specific delta transformer).
 */
declare class DeltaBundler<T = MixedOutput> {
  _changeEventSource: EventEmitter;
  _deltaCalculators: Map<Graph<T>, DeltaCalculator<T>>;
  constructor(changeEventSource: EventEmitter);
  end(): void;
  getDependencies(
    entryPoints: ReadonlyArray<string>,
    options: Options<T>,
  ): Promise<ReadOnlyGraph<T>['dependencies']>;
  buildGraph(
    entryPoints: ReadonlyArray<string>,
    options: Options<T>,
  ): Promise<Graph<T>>;
  getDelta(
    graph: Graph<T>,
    $$PARAM_1$$: {reset: boolean; shallow: boolean},
  ): Promise<DeltaResult<T>>;
  listen(graph: Graph<T>, callback: () => Promise<void>): () => void;
  endGraph(graph: Graph<T>): void;
}
export default DeltaBundler;
