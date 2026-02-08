/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type Bundler from '../Bundler';
import type {TransformFn, default as DeltaBundler} from '../DeltaBundler';
import type {
  BundlerResolution,
  TransformInputOptions,
  TransformResultDependency,
} from '../DeltaBundler/types';
import type {ResolverInputOptions} from '../shared/types';
import type {ConfigT} from 'metro-config';

export declare function getTransformFn(
  entryFiles: ReadonlyArray<string>,
  bundler: Bundler,
  deltaBundler: DeltaBundler,
  config: ConfigT,
  options: TransformInputOptions,
  resolverOptions: ResolverInputOptions,
): Promise<TransformFn>;
export declare function getResolveDependencyFn(
  bundler: Bundler,
  platform: null | undefined | string,
  resolverOptions: ResolverInputOptions,
): Promise<
  (from: string, dependency: TransformResultDependency) => BundlerResolution
>;
