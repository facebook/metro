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
import type {Module, default as DeltaBundler} from '../DeltaBundler';
import type {TransformInputOptions} from '../DeltaBundler/types';
import type {ResolverInputOptions} from '../shared/types';
import type {ConfigT} from 'metro-config';

declare function getPrependedScripts(
  config: ConfigT,
  options: Omit<TransformInputOptions, 'type'>,
  resolverOptions: ResolverInputOptions,
  bundler: Bundler,
  deltaBundler: DeltaBundler,
): Promise<ReadonlyArray<Module>>;
export default getPrependedScripts;
