/**
 * Copyright (c) 2018-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

import type {TransformResultDependency} from '../ModuleGraph/types.flow';

export type MixedOutput = {|
  +data: mixed,
  +type: string,
|};

export type Dependency = {|
  +absolutePath: string,
  +data: TransformResultDependency,
|};

export type Module<T = MixedOutput> = {|
  dependencies: Map<string, Dependency>,
  inverseDependencies: Set<string>,
  output: $ReadOnlyArray<T>,
  path: string,
  getSource: () => string,
|};

export type Graph<T = MixedOutput> = {|
  dependencies: Map<string, Module<T>>,
  entryPoints: $ReadOnlyArray<string>,
|};

export type TransformResult<T = MixedOutput> = {|
  dependencies: $ReadOnlyArray<TransformResultDependency>,
  output: $ReadOnlyArray<T>,
  +getSource: () => string,
|};

export type TransformFn<T = MixedOutput> = string => Promise<
  TransformResult<T>,
>;

export type Options<T = MixedOutput> = {|
  resolve: (from: string, to: string) => string,
  transform: TransformFn<T>,
  onProgress: ?(numProcessed: number, total: number) => mixed,
|};

export type DeltaResult<T = MixedOutput> = {|
  +modified: Map<string, Module<T>>,
  +deleted: Set<string>,
  +reset: boolean,
|};
