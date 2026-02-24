/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<cb5003f203d26e24459419b5f28e4f06>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/getGraphId.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {TransformInputOptions} from '../DeltaBundler/types';
import type {ResolverInputOptions} from '../shared/types';

export declare type GraphId = string;
declare function getGraphId(
  entryFile: string,
  options: TransformInputOptions,
  $$PARAM_2$$: Readonly<{
    shallow: boolean;
    lazy: boolean;
    unstable_allowRequireContext: boolean;
    resolverOptions: ResolverInputOptions;
  }>,
): GraphId;
export default getGraphId;
