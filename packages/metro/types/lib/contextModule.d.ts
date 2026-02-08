/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
