/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<55bd91c160900bb31ffe72e2ddfad85d>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/helpers/getTransitiveDependencies.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {ReadOnlyGraph} from '../../types';

declare function getTransitiveDependencies<T>(
  path: string,
  graph: ReadOnlyGraph<T>,
): Set<string>;
export default getTransitiveDependencies;
