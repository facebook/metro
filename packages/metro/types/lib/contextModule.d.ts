/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<461f7a7b3b3d99d1f1e7eeeeb5125686>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/contextModule.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {
  ContextMode,
  RequireContextParams,
} from '../ModuleGraph/worker/collectDependencies';

export type RequireContext = Readonly<{
  recursive: boolean;
  filter: RegExp;
  /** Mode for resolving dynamic dependencies. Defaults to `sync` */
  mode: ContextMode;
  /** Absolute path of the directory to search in */
  from: string;
}>;
/** Given a fully qualified require context, return a virtual file path that ensures uniqueness between paths with different contexts. */
export declare function deriveAbsolutePathFromContext(
  from: string,
  context: RequireContextParams,
): string;
/** Match a file against a require context. */
export declare function fileMatchesContext(
  testPath: string,
  context: RequireContext,
): boolean;
