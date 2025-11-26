/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 *
 */

import type {WatchmanQuery, WatchmanQuerySince} from 'fb-watchman';

type PlanQueryArgs = Readonly<{
  since: null | undefined | WatchmanQuerySince;
  directoryFilters: ReadonlyArray<string>;
  extensions: ReadonlyArray<string>;
  includeSha1: boolean;
  includeSymlinks: boolean;
}>;
export declare function planQuery(args: PlanQueryArgs): {
  query: WatchmanQuery;
  queryGenerator: string;
};
