/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<bf08da4ef625a52c96e6ab5e4b6b088a>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/utils/isSubpathDefinedInExportsLike.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

/**
 * Identifies whether the given subpath is defined in the given "exports"-like
 * mapping. Does not reduce exports conditions (therefore does not identify
 * whether the subpath is mapped to a value).
 */
import type {NormalizedExportsLikeMap} from '../types';

export declare function isSubpathDefinedInExportsLike(
  exportsLikeMap: NormalizedExportsLikeMap,
  subpath: string,
): boolean;
