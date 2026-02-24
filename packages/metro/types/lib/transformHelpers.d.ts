/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<dfdfdf9ddb80994cc031e3767a87b56f>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/transformHelpers.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
