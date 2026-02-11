/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import type {RequireContext} from '../lib/contextModule';
import type {
  ModuleData,
  ResolvedDependency,
  ResolveFn,
  TransformFn,
} from './types';

type Parameters<T> = Readonly<{
  resolve: ResolveFn;
  transform: TransformFn<T>;
  shouldTraverse: ($$PARAM_0$$: ResolvedDependency) => boolean;
}>;
export declare function buildSubgraph<T>(
  entryPaths: ReadonlySet<string>,
  resolvedContexts: ReadonlyMap<string, null | undefined | RequireContext>,
  $$PARAM_2$$: Parameters<T>,
): Promise<{
  moduleData: Map<string, ModuleData<T>>;
  errors: Map<string, Error>;
}>;
