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
  Dependencies,
  GraphInputOptions,
  MixedOutput,
  Module,
  Options,
  TransformInputOptions,
} from './types';

export interface Result<T> {
  added: Map<string, Module<T>>;
  modified: Map<string, Module<T>>;
  deleted: Set<string>;
}

export class Graph<T = MixedOutput> {
  entryPoints: ReadonlySet<string>;
  transformOptions: TransformInputOptions;
  dependencies: Dependencies<T>;
  constructor(options: GraphInputOptions);
  traverseDependencies(
    paths: ReadonlyArray<string>,
    options: Options<T>,
  ): Promise<Result<T>>;
  initialTraverseDependencies(options: Options<T>): Promise<Result<T>>;
  markModifiedContextModules(
    filePath: string,
    modifiedPaths: Set<string>,
  ): void;
}
