/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/**
 * Portions of this code are based on the Synchronous Cycle Collection
 * algorithm described in:
 *
 * David F. Bacon and V. T. Rajan. 2001. Concurrent Cycle Collection in
 * Reference Counted Systems. In Proceedings of the 15th European Conference on
 * Object-Oriented Programming (ECOOP '01). Springer-Verlag, Berlin,
 * Heidelberg, 207–235.
 *
 * Notable differences from the algorithm in the paper:
 * 1. Our implementation uses the inverseDependencies set (which we already
 *    have to maintain) instead of a separate refcount variable. A module's
 *    reference count is equal to the size of its inverseDependencies set, plus
 *    1 if it's an entry point of the graph.
 * 2. We keep the "root buffer" (possibleCycleRoots) free of duplicates by
 *    making it a Set, instead of storing a "buffered" flag on each node.
 * 3. On top of tracking edges between nodes, we also count references between
 *    nodes and entries in the importBundleNodes set.
 */

import type {RequireContext} from '../lib/contextModule';
import type {
  Dependencies,
  Dependency,
  GraphInputOptions,
  MixedOutput,
  Module,
  ModuleData,
  Options,
  ResolvedDependency,
  TransformInputOptions,
} from './types';

import CountingSet from '../lib/CountingSet';

export type Result<T> = {
  added: Map<string, Module<T>>;
  modified: Map<string, Module<T>>;
  deleted: Set<string>;
};
/**
 * Internal data structure that the traversal logic uses to know which of the
 * files have been modified. This allows to return the added modules before the
 * modified ones (which is useful for things like Hot Module Reloading).
 **/
/**
 * Internal data structure that the traversal logic uses to know which of the
 * files have been modified. This allows to return the added modules before the
 * modified ones (which is useful for things like Hot Module Reloading).
 **/
type Delta<T> = Readonly<{
  added: Set<string>;
  touched: Set<string>;
  deleted: Set<string>;
  updatedModuleData: ReadonlyMap<string, ModuleData<T>>;
  baseModuleData: Map<string, ModuleData<T>>;
  errors: ReadonlyMap<string, Error>;
}>;
type InternalOptions<T> = Readonly<{
  lazy: boolean;
  onDependencyAdd: () => unknown;
  onDependencyAdded: () => unknown;
  resolve: Options<T>['resolve'];
  transform: Options<T>['transform'];
  shallow: boolean;
}>;
export declare class Graph<T = MixedOutput> {
  readonly entryPoints: ReadonlySet<string>;
  readonly transformOptions: TransformInputOptions;
  readonly dependencies: Dependencies<T>;
  constructor(options: GraphInputOptions);
  /**
   * Dependency Traversal logic for the Delta Bundler. This method calculates
   * the modules that should be included in the bundle by traversing the
   * dependency graph.
   * Instead of traversing the whole graph each time, it just calculates the
   * difference between runs by only traversing the added/removed dependencies.
   * To do so, it uses the passed graph dependencies and it mutates it.
   * The paths parameter contains the absolute paths of the root files that the
   * method should traverse. Normally, these paths should be the modified files
   * since the last traversal.
   */
  traverseDependencies(
    paths: ReadonlyArray<string>,
    options: Options<T>,
  ): Promise<Result<T>>;
  initialTraverseDependencies(options: Options<T>): Promise<Result<T>>;
  _buildDelta(
    pathsToVisit: ReadonlySet<string>,
    options: InternalOptions<T>,
    moduleFilter?: (path: string) => boolean,
  ): Promise<Delta<T>>;
  _recursivelyCommitModule(
    path: string,
    delta: Delta<T>,
    options: InternalOptions<T>,
    commitOptions?: Readonly<{onlyRemove: boolean}>,
  ): Module<T>;
  _addDependency(
    parentModule: Module<T>,
    key: string,
    dependency: Dependency,
    requireContext: null | undefined | RequireContext,
    delta: Delta<T>,
    options: InternalOptions<T>,
  ): void;
  _removeDependency(
    parentModule: Module<T>,
    key: string,
    dependency: Dependency,
    delta: Delta<T>,
    options: InternalOptions<T>,
  ): void;
  /**
   * Collect a list of context modules which include a given file.
   */
  markModifiedContextModules(
    filePath: string,
    modifiedPaths: Set<string> | CountingSet<string>,
  ): void;
  /**
   * Gets the list of modules affected by the deletion of a given file. The
   * caller is expected to mark these modules as modified in the next call to
   * traverseDependencies. Note that the list may contain duplicates.
   */
  getModifiedModulesForDeletedPath(filePath: string): Iterable<string>;
  /**
   * Re-traverse the dependency graph in DFS order to reorder the modules and
   * guarantee the same order between runs. This method mutates the passed graph.
   */
  reorderGraph(options: {shallow: boolean}): void;
  _reorderDependencies(
    module: Module<T>,
    orderedDependencies: Map<string, Module<T>>,
    options: {shallow: boolean},
  ): void;
  /** Garbage collection functions */

  _incrementImportBundleReference(
    dependency: ResolvedDependency,
    parentModule: Module<T>,
  ): void;
  _decrementImportBundleReference(
    dependency: ResolvedDependency,
    parentModule: Module<T>,
  ): void;
  _markModuleInUse(module: Module<T>): void;
  _children(
    module: Module<T>,
    options: InternalOptions<T>,
  ): Iterator<Module<T>>;
  _moduleSnapshot(module: Module<T>): ModuleData<T>;
  _releaseModule(
    module: Module<T>,
    delta: Delta<T>,
    options: InternalOptions<T>,
  ): void;
  _freeModule(module: Module<T>, delta: Delta<T>): void;
  _markAsPossibleCycleRoot(module: Module<T>): void;
  _collectCycles(delta: Delta<T>, options: InternalOptions<T>): void;
  _markGray(module: Module<T>, options: InternalOptions<T>): void;
  _scan(module: Module<T>, options: InternalOptions<T>): void;
  _scanBlack(module: Module<T>, options: InternalOptions<T>): void;
  _collectWhite(module: Module<T>, delta: Delta<T>): void;

  /** End of garbage collection functions */
}
