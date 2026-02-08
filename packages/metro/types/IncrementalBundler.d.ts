/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {DeltaResult, Graph, Module} from './DeltaBundler';
import type {
  Options as DeltaBundlerOptions,
  ReadOnlyDependencies,
  TransformInputOptions,
} from './DeltaBundler/types';
import type {GraphId} from './lib/getGraphId';
import type {ResolverInputOptions} from './shared/types';
import type {ConfigT} from 'metro-config';

import Bundler from './Bundler';
import DeltaBundler from './DeltaBundler';

export declare type RevisionId = string;
export type OutputGraph = Graph;
type OtherOptions = Readonly<{
  onProgress: DeltaBundlerOptions['onProgress'];
  shallow: boolean;
  lazy: boolean;
}>;
export type GraphRevision = {
  readonly id: RevisionId;
  readonly date: Date;
  readonly graphId: GraphId;
  readonly graph: OutputGraph;
  readonly prepend: ReadonlyArray<Module>;
};
export type IncrementalBundlerOptions = Readonly<{
  hasReducedPerformance?: boolean;
  watch?: boolean;
}>;
declare class IncrementalBundler {
  _config: ConfigT;
  _bundler: Bundler;
  _deltaBundler: DeltaBundler;
  _revisionsById: Map<RevisionId, Promise<GraphRevision>>;
  _revisionsByGraphId: Map<GraphId, Promise<GraphRevision>>;
  static revisionIdFromString: (str: string) => RevisionId;
  constructor(config: ConfigT, options?: IncrementalBundlerOptions);
  end(): Promise<void>;
  getBundler(): Bundler;
  getDeltaBundler(): DeltaBundler;
  getRevision(
    revisionId: RevisionId,
  ): null | undefined | Promise<GraphRevision>;
  getRevisionByGraphId(
    graphId: GraphId,
  ): null | undefined | Promise<GraphRevision>;
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
  ): Promise<ReadOnlyDependencies>;
  buildGraph(
    entryFile: string,
    transformOptions: TransformInputOptions,
    resolverOptions: ResolverInputOptions,
    otherOptions?: OtherOptions,
  ): Promise<{
    readonly graph: OutputGraph;
    readonly prepend: ReadonlyArray<Module>;
  }>;
  initializeGraph(
    entryFile: string,
    transformOptions: TransformInputOptions,
    resolverOptions: ResolverInputOptions,
    otherOptions?: OtherOptions,
  ): Promise<{delta: DeltaResult; revision: GraphRevision}>;
  updateGraph(
    revision: GraphRevision,
    reset: boolean,
  ): Promise<{delta: DeltaResult; revision: GraphRevision}>;
  endGraph(graphId: GraphId): Promise<void>;
  _getAbsoluteEntryFiles(
    entryFiles: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<string>>;
  ready(): Promise<void>;
}
export default IncrementalBundler;
