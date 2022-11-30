/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {WatchmanClockSpec} from '../../flow-types';
import type {
  CrawlerOptions,
  FileData,
  FileMetaData,
  Path,
  WatchmanClocks,
} from '../../flow-types';
import type {WatchmanQueryResponse, WatchmanWatchResponse} from 'fb-watchman';

import H from '../../constants';
import * as fastPath from '../../lib/fast_path';
import normalizePathSep from '../../lib/normalizePathSep';
import {planQuery} from './planQuery';
import invariant from 'invariant';
import * as path from 'path';
import {performance} from 'perf_hooks';

const watchman = require('fb-watchman');

type WatchmanRoots = Map<string, Array<string>>;

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
  enableSymlinks,
  extensions,
  ignore,
  onStatus,
  perfLogger,
  previousState,
  rootDir,
  roots,
}: CrawlerOptions): Promise<{
  changedFiles: FileData,
  removedFiles: FileData,
  clocks: WatchmanClocks,
}> {
  perfLogger?.point('watchmanCrawl_start');

  const newClocks = new Map<Path, WatchmanClockSpec>();

  const client = new watchman.Client();
  abortSignal?.addEventListener('abort', () => client.end());

  let clientError;
  client.on('error', error => {
    clientError = makeWatchmanError(error);
  });

  const cmd = async <T>(
    command: 'watch-project' | 'query',
    // $FlowFixMe[unclear-type] - Fix to use fb-watchman types
    ...args: Array<any>
  ): Promise<T> => {
    let didLogWatchmanWaitMessage = false;
    const startTime = performance.now();
    const logWatchmanWaitMessage = () => {
      didLogWatchmanWaitMessage = true;
      onStatus({
        type: 'watchman_slow_command',
        timeElapsed: performance.now() - startTime,
        command,
      });
    };
    let intervalOrTimeoutId: TimeoutID | IntervalID = setTimeout(() => {
      logWatchmanWaitMessage();
      intervalOrTimeoutId = setInterval(
        logWatchmanWaitMessage,
        WATCHMAN_WARNING_INTERVAL_MILLISECONDS,
      );
    }, WATCHMAN_WARNING_INITIAL_DELAY_MILLISECONDS);
    try {
      const response = await new Promise<WatchmanQueryResponse>(
        (resolve, reject) =>
          // $FlowFixMe[incompatible-call] - dynamic call of command
          client.command(
            [command, ...args],
            (error: ?Error, result: WatchmanQueryResponse) =>
              error ? reject(makeWatchmanError(error)) : resolve(result),
          ),
      );
      if ('warning' in response) {
        onStatus({
          type: 'watchman_warning',
          warning: response.warning,
          command,
        });
      }
      // $FlowFixMe[incompatible-return]
      return response;
    } finally {
      // $FlowFixMe[incompatible-call] clearInterval / clearTimeout are interchangeable
      clearInterval(intervalOrTimeoutId);
      if (didLogWatchmanWaitMessage) {
        onStatus({
          type: 'watchman_slow_command_complete',
          timeElapsed: performance.now() - startTime,
          command,
        });
      }
    }
  };

  async function getWatchmanRoots(
    roots: $ReadOnlyArray<Path>,
  ): Promise<WatchmanRoots> {
    perfLogger?.point('watchmanCrawl/getWatchmanRoots_start');
    const watchmanRoots = new Map<string, Array<string>>();
    await Promise.all(
      roots.map(async (root, index) => {
        perfLogger?.point(`watchmanCrawl/watchProject_${index}_start`);
        const response = await cmd<WatchmanWatchResponse>(
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
          const since = previousState.clocks.get(
            fastPath.relative(rootDir, root),
          );

          perfLogger?.annotate({
            bool: {
              [`watchmanCrawl/query_${index}_has_clock`]: since != null,
            },
          });

          const {query, queryGenerator} = planQuery({
            since,
            extensions,
            directoryFilters,
            includeSha1: computeSha1,
            includeSymlinks: enableSymlinks,
          });

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

  let removedFiles = new Map<Path, FileMetaData>();
  const changedFiles = new Map<Path, FileMetaData>();
  let results: Map<string, WatchmanQueryResponse>;
  let isFresh = false;
  let queryError: ?Error;
  try {
    const watchmanRoots = await getWatchmanRoots(roots);
    const watchmanFileResults = await queryWatchmanForDirs(watchmanRoots);

    // Reset the file map if watchman was restarted and sends us a list of
    // files.
    if (watchmanFileResults.isFresh) {
      removedFiles = new Map(previousState.files);
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
    newClocks.set(
      relativeFsRoot,
      // Ensure we persist only the local clock.
      typeof response.clock === 'string'
        ? response.clock
        : response.clock.clock,
    );

    for (const fileData of response.files) {
      if (fileData.symlink_target != null) {
        // TODO: Process symlinks
        continue;
      }
      const filePath = fsRoot + path.sep + normalizePathSep(fileData.name);
      const relativeFilePath = fastPath.relative(rootDir, filePath);
      const existingFileData = previousState.files.get(relativeFilePath);

      // If watchman is fresh, the removed files map starts with all files
      // and we remove them as we verify they still exist.
      if (isFresh && existingFileData && fileData.exists) {
        removedFiles.delete(relativeFilePath);
      }

      if (!fileData.exists) {
        // No need to act on files that do not exist and were not tracked.
        if (existingFileData) {
          // If watchman is not fresh, we will know what specific files were
          // deleted since we last ran and can track only those files.
          if (!isFresh) {
            removedFiles.set(relativeFilePath, existingFileData);
          }
        }
      } else if (!ignore(filePath)) {
        const {mtime_ms, size} = fileData;
        invariant(
          mtime_ms != null && size != null,
          'missing file data in watchman response',
        );
        const mtime =
          typeof mtime_ms === 'number' ? mtime_ms : mtime_ms.toNumber();

        if (existingFileData && existingFileData[H.MTIME] === mtime) {
          continue;
        }

        let sha1hex = fileData['content.sha1hex'];
        if (typeof sha1hex !== 'string' || sha1hex.length !== 40) {
          sha1hex = undefined;
        }

        let nextData: FileMetaData = ['', mtime, size, 0, '', sha1hex ?? null];

        if (
          existingFileData &&
          sha1hex != null &&
          existingFileData[H.SHA1] === sha1hex
        ) {
          // Special case - file touched but not modified, so we can reuse the
          // metadata and just update mtime.
          nextData = [
            existingFileData[0],
            mtime,
            existingFileData[2],
            existingFileData[3],
            existingFileData[4],
            existingFileData[5],
          ];
        }

        changedFiles.set(relativeFilePath, nextData);
      }
    }
  }

  perfLogger?.point('watchmanCrawl/processResults_end');
  perfLogger?.point('watchmanCrawl_end');
  return {
    changedFiles,
    removedFiles,
    clocks: newClocks,
  };
};
