/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {ContextMode} from '../ModuleGraph/worker/collectDependencies';

export interface RequireContext {
  /* Should search for files recursively. Optional, default `true` when `require.context` is used */
  readonly recursive: boolean;
  /* Filename filter pattern for use in `require.context`. Optional, default `.*` (any file) when `require.context` is used */
  readonly filter: RegExp;
  /** Mode for resolving dynamic dependencies. Defaults to `sync` */
  readonly mode: ContextMode;
  /** Absolute path of the directory to search in */
  readonly from: string;
}
