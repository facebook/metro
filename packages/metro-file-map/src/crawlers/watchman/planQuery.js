/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

import type {
  WatchmanDirnameExpression,
  WatchmanQuery,
  WatchmanQuerySince,
} from 'fb-watchman';

export function planQuery({
  since,
  directoryFilters,
  extensions,
  includeSha1,
}: $ReadOnly<{
  since: ?WatchmanQuerySince,
  directoryFilters: $ReadOnlyArray<string>,
  extensions: $ReadOnlyArray<string>,
  includeSha1: boolean,
}>): {
  query: WatchmanQuery,
  queryGenerator: string,
} {
  const fields = ['name', 'exists', 'mtime_ms', 'size'];
  if (includeSha1) {
    fields.push('content.sha1hex');
  }

  const expression = [
    'allof',
    // Match regular files only. Different Watchman generators treat
    // symlinks differently, so this ensures consistent results.
    ['type', 'f'],
  ];

  const query: WatchmanQuery = {
    fields,
    expression,
  };

  /**
   * Watchman "query planner".
   *
   * Watchman file queries consist of 1 or more generators that feed
   * files through the expression evaluator.
   *
   * Strategy:
   * 1. Select the narrowest possible generator so that the expression
   *    evaluator has fewer candidates to process.
   * 2. Evaluate expressions from narrowest to broadest.
   * 3. Don't use an expression to recheck a condition that the
   *    generator already guarantees.
   * 4. Compose expressions to avoid combinatorial explosions in the
   *    number of terms.
   *
   * The ordering of generators/filters, from narrow to broad, is:
   * - since          = O(changes)
   * - glob / dirname = O(files in a subtree of the repo)
   * - suffix         = O(files in the repo)
   *
   * We assume that file extensions are ~uniformly distributed in the
   * repo but Haste map projects are focused on a handful of
   * directories. Therefore `glob` < `suffix`.
   */
  let queryGenerator: ?string;
  if (since != null) {
    // Use the `since` generator and filter by both path and extension.
    query.since = since;
    queryGenerator = 'since';
    expression.push(
      [
        'anyof',
        ...directoryFilters.map(
          dir => (['dirname', dir]: WatchmanDirnameExpression),
        ),
      ],
      ['suffix', extensions],
    );
  } else if (directoryFilters.length > 0) {
    // Use the `glob` generator and filter only by extension.
    query.glob = directoryFilters.map(directory => `${directory}/**`);
    query.glob_includedotfiles = true;
    queryGenerator = 'glob';

    expression.push(['suffix', extensions]);
  } else {
    // Use the `suffix` generator with no path/extension filtering.
    query.suffix = extensions;
    queryGenerator = 'suffix';
  }

  return {query, queryGenerator};
}
