/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<542d8499f7c1ed111b466dbea5bc98db>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/crawlers/watchman/planQuery.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

type WatchmanQuery = {[key: string]: unknown};
type WatchmanQuerySince = unknown;

export declare function planQuery(
  args: Readonly<{
    since: WatchmanQuerySince;
    directoryFilters: ReadonlyArray<string>;
    extensions: ReadonlyArray<string>;
    includeSha1: boolean;
    includeSymlinks: boolean;
  }>,
): {
  query: WatchmanQuery;
  queryGenerator: string;
};
