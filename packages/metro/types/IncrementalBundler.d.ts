/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type Bundler from './Bundler';
import type {
  Options as DeltaBundlerOptions,
  ReadOnlyDependencies,
  TransformInputOptions,
} from './DeltaBundler/types';
import type {GraphId} from './lib/getGraphId';
import type {ConfigT} from 'metro-config';

import DeltaBundler, {DeltaResult, Graph, Module} from './DeltaBundler';
import {ResolverInputOptions} from './shared/types';

export type RevisionId = string;

export type OutputGraph = Graph<void>;

export interface OtherOptions {
  readonly onProgress: DeltaBundlerOptions<void>['onProgress'];
  readonly shallow: boolean;
}

export interface GraphRevision {
  readonly id: RevisionId;
  readonly date: Date;
  readonly graphId: GraphId;
  readonly graph: OutputGraph;
  readonly prepend: ReadonlyArray<Module<void>>;
}

export interface IncrementalBundlerOptions {
  readonly hasReducedPerformance?: boolean;
  readonly watch?: boolean;
}

export default class IncrementalBundler {
  static revisionIdFromString: (str: string) => RevisionId;
  constructor(config: ConfigT, options?: IncrementalBundlerOptions);

  end(): void;
  getBundler(): Bundler;
  getDeltaBundler(): DeltaBundler<void>;
  getRevision(revisionId: RevisionId): Promise<GraphRevision> | null;
  getRevisionByGraphId(graphId: GraphId): Promise<GraphRevision> | null;

  buildGraphForEntries(
    entryFiles: ReadonlyArray<string>,
    transformOptions: TransformInputOptions,
    resolverOptions: ResolverInputOptions,
    otherOptions?: OtherOptions,
  ): Promise<OutputGraph>;

  getDependencies(
    entryFiles: ReadonlyArray<string>,
    transformOptions: TransformInputOptions,
    resolverOptions: ResolverInputOptions,
    otherOptions?: OtherOptions,
  ): Promise<ReadOnlyDependencies<void>>;

  buildGraph(
    entryFile: string,
    transformOptions: TransformInputOptions,
    resolverOptions: ResolverInputOptions,
    otherOptions?: OtherOptions,
  ): Promise<
    Readonly<{graph: OutputGraph; prepend: ReadonlyArray<Module<void>>}>
  >;

  initializeGraph(
    entryFile: string,
    transformOptions: TransformInputOptions,
    resolverOptions: ResolverInputOptions,
    otherOptions?: OtherOptions,
  ): Promise<{
    delta: DeltaResult<void>;
    revision: GraphRevision;
  }>;

  updateGraph(
    revision: GraphRevision,
    reset: boolean,
  ): Promise<{
    delta: DeltaResult<void>;
    revision: GraphRevision;
  }>;

  endGraph(graphId: GraphId): Promise<void>;
  ready(): Promise<void>;
}
