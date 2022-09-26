/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {
  CrawlerOptions,
  FileData,
  FileMetaData,
  InternalData,
  Path,
} from '../flow-types';

import H from '../constants';
import * as fastPath from '../lib/fast_path';
import normalizePathSep from '../lib/normalizePathSep';
import * as path from 'path';

const watchman = require('fb-watchman');

// $FlowFixMe[unclear-type] - Improve fb-watchman types to cover our uses
type WatchmanQuery = any;

type WatchmanRoots = Map<string, Array<string>>;

type WatchmanWatchProjectResponse = {
  watch: string,
  relative_path: string,
};

type WatchmanQueryResponse = {
  warning?: string,
  is_fresh_instance: boolean,
  version: string,
  clock:
    | string
    | {
        scm: {'mergebase-with': string, mergebase: string},
        clock: string,
      },
  files: Array<{
    name: string,
    exists: boolean,
    mtime_ms: number | {toNumber: () => number},
    size: number,
    'content.sha1hex'?: string,
  }>,
};

const WATCHMAN_WARNING_INITIAL_DELAY_MILLISECONDS = 10000;
const WATCHMAN_WARNING_INTERVAL_MILLISECONDS = 20000;

const watchmanURL = 'https://facebook.github.io/watchman/docs/troubleshooting';

function makeWatchmanError(error: Error): Error {
  error.message =
    `Watchman error: ${error.message.trim()}. Make sure watchman ` +
    `is running for this project. See ${watchmanURL}.`;
  return error;
}

module.exports = async function watchmanCrawl({
  abortSignal,
  computeSha1,
  data,
  extensions,
  ignore,
  rootDir,
  roots,
  perfLogger,
}: CrawlerOptions): Promise<{
  changedFiles?: FileData,
  removedFiles: FileData,
  hasteMap: InternalData,
}> {
  perfLogger?.point('watchmanCrawl_start');

  const fields = ['name', 'exists', 'mtime_ms', 'size'];
  if (computeSha1) {
    fields.push('content.sha1hex');
  }
  const clocks = data.clocks;

  const client = new watchman.Client();
  abortSignal?.addEventListener('abort', () => client.end());

  let clientError;
  // $FlowFixMe[prop-missing] - Client is not typed as an EventEmitter
  client.on('error', error => (clientError = makeWatchmanError(error)));

  let didLogWatchmanWaitMessage = false;

  // $FlowFixMe[unclear-type] - Fix to use fb-watchman types
  const cmd = async <T>(command: string, ...args: Array<any>): Promise<T> => {
    const logWatchmanWaitMessage = () => {
      didLogWatchmanWaitMessage = true;
      console.warn(`Waiting for Watchman (${command})...`);
    };
    let intervalOrTimeoutId: TimeoutID | IntervalID = setTimeout(() => {
      logWatchmanWaitMessage();
      intervalOrTimeoutId = setInterval(
        logWatchmanWaitMessage,
        WATCHMAN_WARNING_INTERVAL_MILLISECONDS,
      );
    }, WATCHMAN_WARNING_INITIAL_DELAY_MILLISECONDS);
    try {
      return await new Promise((resolve, reject) =>
        // $FlowFixMe[incompatible-call] - dynamic call of command
        client.command([command, ...args], (error, result) =>
          error ? reject(makeWatchmanError(error)) : resolve(result),
        ),
      );
    } finally {
      // $FlowFixMe[incompatible-call] clearInterval / clearTimeout are interchangeable
      clearInterval(intervalOrTimeoutId);
    }
  };

  async function getWatchmanRoots(
    roots: $ReadOnlyArray<Path>,
  ): Promise<WatchmanRoots> {
    perfLogger?.point('watchmanCrawl/getWatchmanRoots_start');
    const watchmanRoots = new Map();
    await Promise.all(
      roots.map(async (root, index) => {
        perfLogger?.point(`watchmanCrawl/watchProject_${index}_start`);
        const response = await cmd<WatchmanWatchProjectResponse>(
          'watch-project',
          root,
        );
        perfLogger?.point(`watchmanCrawl/watchProject_${index}_end`);
        const existing = watchmanRoots.get(response.watch);
        // A root can only be filtered if it was never seen with a
        // relative_path before.
        const canBeFiltered = !existing || existing.length > 0;

        if (canBeFiltered) {
          if (response.relative_path) {
            watchmanRoots.set(
              response.watch,
              (existing || []).concat(response.relative_path),
            );
          } else {
            // Make the filter directories an empty array to signal that this
            // root was already seen and needs to be watched for all files or
            // directories.
            watchmanRoots.set(response.watch, []);
          }
        }
      }),
    );
    perfLogger?.point('watchmanCrawl/getWatchmanRoots_end');
    return watchmanRoots;
  }

  async function queryWatchmanForDirs(rootProjectDirMappings: WatchmanRoots) {
    perfLogger?.point('watchmanCrawl/queryWatchmanForDirs_start');
    const results = new Map<string, WatchmanQueryResponse>();
    let isFresh = false;
    await Promise.all(
      Array.from(rootProjectDirMappings).map(
        async ([root, directoryFilters], index) => {
          // Jest is only going to store one type of clock; a string that
          // represents a local clock. However, the Watchman crawler supports
          // a second type of clock that can be written by automation outside of
          // Jest, called an "scm query", which fetches changed files based on
          // source control mergebases. The reason this is necessary is because
          // local clocks are not portable across systems, but scm queries are.
          // By using scm queries, we can create the haste map on a different
          // system and import it, transforming the clock into a local clock.
          const since = clocks.get(fastPath.relative(rootDir, root));

          perfLogger?.annotate({
            bool: {
              [`watchmanCrawl/query_${index}_has_clock`]: since != null,
            },
          });

          const query: WatchmanQuery = {
            fields,
            expression: [
              'allof',
              // Match regular files only. Different Watchman generators treat
              // symlinks differently, so this ensures consistent results.
              ['type', 'f'],
            ],
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
            query.expression.push(
              ['anyof', ...directoryFilters.map(dir => ['dirname', dir])],
              ['suffix', extensions],
            );
          } else if (directoryFilters.length > 0) {
            // Use the `glob` generator and filter only by extension.
            query.glob = directoryFilters.map(directory => `${directory}/**`);
            query.glob_includedotfiles = true;
            queryGenerator = 'glob';

            query.expression.push(['suffix', extensions]);
          } else {
            // Use the `suffix` generator with no path/extension filtering.
            query.suffix = extensions;
            queryGenerator = 'suffix';
          }

          perfLogger?.annotate({
            string: {
              [`watchmanCrawl/query_${index}_generator`]: queryGenerator,
            },
          });

          perfLogger?.point(`watchmanCrawl/query_${index}_start`);
          const response = await cmd<WatchmanQueryResponse>(
            'query',
            root,
            query,
          );
          perfLogger?.point(`watchmanCrawl/query_${index}_end`);

          if ('warning' in response) {
            console.warn('watchman warning: ', response.warning);
          }

          // When a source-control query is used, we ignore the "is fresh"
          // response from Watchman because it will be true despite the query
          // being incremental.
          const isSourceControlQuery =
            typeof since !== 'string' && since?.scm?.['mergebase-with'] != null;
          if (!isSourceControlQuery) {
            isFresh = isFresh || response.is_fresh_instance;
          }

          results.set(root, response);
        },
      ),
    );

    perfLogger?.point('watchmanCrawl/queryWatchmanForDirs_end');

    return {
      isFresh,
      results,
    };
  }

  let files = data.files;
  let removedFiles = new Map();
  const changedFiles = new Map();
  let results: Map<string, WatchmanQueryResponse>;
  let isFresh = false;
  let queryError: ?Error;
  try {
    const watchmanRoots = await getWatchmanRoots(roots);
    const watchmanFileResults = await queryWatchmanForDirs(watchmanRoots);

    // Reset the file map if watchman was restarted and sends us a list of
    // files.
    if (watchmanFileResults.isFresh) {
      files = new Map();
      removedFiles = new Map(data.files);
      isFresh = true;
    }

    results = watchmanFileResults.results;
  } catch (e) {
    queryError = e;
  }
  client.end();

  if (results == null) {
    if (clientError) {
      perfLogger?.annotate({
        string: {
          'watchmanCrawl/client_error':
            clientError.message ?? '[message missing]',
        },
      });
    }
    if (queryError) {
      perfLogger?.annotate({
        string: {
          'watchmanCrawl/query_error':
            queryError.message ?? '[message missing]',
        },
      });
    }
    perfLogger?.point('watchmanCrawl_end');
    throw (
      queryError ?? clientError ?? new Error('Watchman file results missing')
    );
  }

  perfLogger?.point('watchmanCrawl/processResults_start');

  for (const [watchRoot, response] of results) {
    const fsRoot = normalizePathSep(watchRoot);
    const relativeFsRoot = fastPath.relative(rootDir, fsRoot);
    clocks.set(
      relativeFsRoot,
      // Ensure we persist only the local clock.
      typeof response.clock === 'string'
        ? response.clock
        : response.clock.clock,
    );

    for (const fileData of response.files) {
      const filePath = fsRoot + path.sep + normalizePathSep(fileData.name);
      const relativeFilePath = fastPath.relative(rootDir, filePath);
      const existingFileData = data.files.get(relativeFilePath);

      // If watchman is fresh, the removed files map starts with all files
      // and we remove them as we verify they still exist.
      if (isFresh && existingFileData && fileData.exists) {
        removedFiles.delete(relativeFilePath);
      }

      if (!fileData.exists) {
        // No need to act on files that do not exist and were not tracked.
        if (existingFileData) {
          files.delete(relativeFilePath);

          // If watchman is not fresh, we will know what specific files were
          // deleted since we last ran and can track only those files.
          if (!isFresh) {
            removedFiles.set(relativeFilePath, existingFileData);
          }
        }
      } else if (!ignore(filePath)) {
        const mtime =
          typeof fileData.mtime_ms === 'number'
            ? fileData.mtime_ms
            : fileData.mtime_ms.toNumber();
        const size = fileData.size;

        let sha1hex = fileData['content.sha1hex'];
        if (typeof sha1hex !== 'string' || sha1hex.length !== 40) {
          sha1hex = undefined;
        }

        let nextData: FileMetaData;

        if (existingFileData && existingFileData[H.MTIME] === mtime) {
          nextData = existingFileData;
        } else if (
          existingFileData &&
          sha1hex != null &&
          existingFileData[H.SHA1] === sha1hex
        ) {
          nextData = [
            existingFileData[0],
            mtime,
            existingFileData[2],
            existingFileData[3],
            existingFileData[4],
            existingFileData[5],
          ];
        } else {
          // See ../constants.ts
          nextData = ['', mtime, size, 0, '', sha1hex ?? null];
        }

        files.set(relativeFilePath, nextData);
        changedFiles.set(relativeFilePath, nextData);
      }
    }
  }

  data.files = files;

  perfLogger?.point('watchmanCrawl/processResults_end');
  perfLogger?.point('watchmanCrawl_end');
  if (didLogWatchmanWaitMessage) {
    console.warn('Watchman query finished.');
  }
  return {
    changedFiles: isFresh ? undefined : changedFiles,
    hasteMap: data,
    removedFiles,
  };
};
