/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<f1d42fcf747b4fa7641e50b8d4ddc424>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/isResolvedDependency.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Dependency, ResolvedDependency} from '../DeltaBundler/types';

export declare function isResolvedDependency(
  dep: Dependency,
): dep is ResolvedDependency;
