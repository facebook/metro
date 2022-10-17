/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

import type {
  Console,
  CrawlerOptions,
  FileData,
  InternalData,
  Path,
  PerfLogger,
} from './flow-types';
import type {WatcherOptions as WatcherBackendOptions} from './watchers/common';
import type {Stats} from 'fs';

import watchmanCrawl from './crawlers/watchman';
import nodeCrawl from './crawlers/node';
import WatchmanWatcher from './watchers/WatchmanWatcher';
import FSEventsWatcher from './watchers/FSEventsWatcher';
// $FlowFixMe[untyped-import] - it's a fork: https://github.com/facebook/jest/pull/10919
import NodeWatcher from './watchers/NodeWatcher';
import * as path from 'path';
import * as fs from 'fs';
import {ADD_EVENT, CHANGE_EVENT} from './watchers/common';
import {performance} from 'perf_hooks';
import nullthrows from 'nullthrows';

const debug = require('debug')('Metro:Watcher');

const MAX_WAIT_TIME = 240000;

type WatcherOptions = {
  abortSignal: AbortSignal,
  computeSha1: boolean,
  console: Console,
  enableSymlinks: boolean,
  extensions: $ReadOnlyArray<string>,
  forceNodeFilesystemAPI: boolean,
  healthCheckFilePrefix: string,
  ignore: string => boolean,
  ignorePattern: RegExp,
  initialData: InternalData,
  perfLogger: ?PerfLogger,
  roots: $ReadOnlyArray<string>,
  rootDir: string,
  useWatchman: boolean,
  watch: boolean,
  watchmanDeferStates: $ReadOnlyArray<string>,
};

interface WatcherBackend {
  getPauseReason(): ?string;
  close(): Promise<void>;
}

let nextInstanceId = 0;

export type HealthCheckResult =
  | {type: 'error', timeout: number, error: Error, watcher: ?string}
  | {type: 'success', timeout: number, timeElapsed: number, watcher: ?string}
  | {type: 'timeout', timeout: number, watcher: ?string, pauseReason: ?string};

export class Watcher {
  _options: WatcherOptions;
  _backends: $ReadOnlyArray<WatcherBackend> = [];
  _instanceId: number;
  _nextHealthCheckId: number = 0;
  _pendingHealthChecks: Map</* basename */ string, /* resolve */ () => void> =
    new Map();
  _activeWatcher: ?string;

  constructor(options: WatcherOptions) {
    this._options = options;
    this._instanceId = nextInstanceId++;
  }

  async crawl(): Promise<?(
    | Promise<{
        changedFiles?: FileData,
        hasteMap: InternalData,
        removedFiles: FileData,
      }>
    | {changedFiles?: FileData, hasteMap: InternalData, removedFiles: FileData}
  )> {
    this._options.perfLogger?.point('crawl_start');

    const options = this._options;
    const ignore = (filePath: string) =>
      options.ignore(filePath) ||
      path.basename(filePath).startsWith(this._options.healthCheckFilePrefix);
    const crawl = options.useWatchman ? watchmanCrawl : nodeCrawl;
    const crawlerOptions: CrawlerOptions = {
      abortSignal: options.abortSignal,
      computeSha1: options.computeSha1,
      data: options.initialData,
      enableSymlinks: options.enableSymlinks,
      extensions: options.extensions,
      forceNodeFilesystemAPI: options.forceNodeFilesystemAPI,
      ignore,
      perfLogger: options.perfLogger,
      rootDir: options.rootDir,
      roots: options.roots,
    };

    const retry = (error: Error) => {
      if (crawl === watchmanCrawl) {
        options.console.warn(
          'metro-file-map: Watchman crawl failed. Retrying once with node ' +
            'crawler.\n' +
            "  Usually this happens when watchman isn't running. Create an " +
            "empty `.watchmanconfig` file in your project's root folder or " +
            'initialize a git or hg repository in your project.\n' +
            '  ' +
            error.toString(),
        );
        return nodeCrawl(crawlerOptions).catch(e => {
          throw new Error(
            'Crawler retry failed:\n' +
              `  Original error: ${error.message}\n` +
              `  Retry error: ${e.message}\n`,
          );
        });
      }

      throw error;
    };

    const logEnd = <T>(result: T): T => {
      this._options.perfLogger?.point('crawl_end');
      return result;
    };

    try {
      return crawl(crawlerOptions).catch(retry).then(logEnd);
    } catch (error) {
      return retry(error).then(logEnd);
    }
  }

  async watch(
    onChange: (
      type: string,
      filePath: string,
      root: string,
      stat?: Stats,
    ) => void,
  ) {
    const {extensions, ignorePattern, useWatchman} = this._options;

    // WatchmanWatcher > FSEventsWatcher > sane.NodeWatcher
    const WatcherImpl = useWatchman
      ? WatchmanWatcher
      : FSEventsWatcher.isSupported()
      ? FSEventsWatcher
      : NodeWatcher;

    let watcher = 'node';
    if (WatcherImpl === WatchmanWatcher) {
      watcher = 'watchman';
    } else if (WatcherImpl === FSEventsWatcher) {
      watcher = 'fsevents';
    }
    debug(`Using watcher: ${watcher}`);
    this._options.perfLogger?.annotate({string: {watcher}});
    this._activeWatcher = watcher;

    const createWatcherBackend = (root: Path): Promise<WatcherBackend> => {
      const watcherOptions: WatcherBackendOptions = {
        dot: true,
        glob: [
          // Ensure we always include package.json files, which are crucial for
          /// module resolution.
          '**/package.json',
          // Ensure we always watch any health check files
          '**/' + this._options.healthCheckFilePrefix + '*',
          ...extensions.map(extension => '**/*.' + extension),
        ],
        ignored: ignorePattern,
        watchmanDeferStates: this._options.watchmanDeferStates,
      };
      const watcher = new WatcherImpl(root, watcherOptions);

      return new Promise((resolve, reject) => {
        const rejectTimeout = setTimeout(
          () => reject(new Error('Failed to start watch mode.')),
          MAX_WAIT_TIME,
        );

        watcher.once('ready', () => {
          clearTimeout(rejectTimeout);
          watcher.on(
            'all',
            (type: string, filePath: string, root: string, stat?: Stats) => {
              const basename = path.basename(filePath);
              if (basename.startsWith(this._options.healthCheckFilePrefix)) {
                if (type === ADD_EVENT || type === CHANGE_EVENT) {
                  debug(
                    'Observed possible health check cookie: %s in %s',
                    filePath,
                    root,
                  );
                  this._handleHealthCheckObservation(basename);
                }
                return;
              }
              onChange(type, filePath, root, stat);
            },
          );
          resolve(watcher);
        });
      });
    };

    this._backends = await Promise.all(
      this._options.roots.map(createWatcherBackend),
    );
  }

  _handleHealthCheckObservation(basename: string) {
    const resolveHealthCheck = this._pendingHealthChecks.get(basename);
    if (!resolveHealthCheck) {
      return;
    }
    resolveHealthCheck();
  }

  async close() {
    await Promise.all(this._backends.map(watcher => watcher.close()));
    this._activeWatcher = null;
  }

  async checkHealth(timeout: number): Promise<HealthCheckResult> {
    const healthCheckId = this._nextHealthCheckId++;
    if (healthCheckId === Number.MAX_SAFE_INTEGER) {
      this._nextHealthCheckId = 0;
    }
    const watcher = this._activeWatcher;
    const basename =
      this._options.healthCheckFilePrefix +
      '-' +
      process.pid +
      '-' +
      this._instanceId +
      '-' +
      healthCheckId;
    const healthCheckPath = path.join(this._options.rootDir, basename);
    let result: ?HealthCheckResult;
    const timeoutPromise = new Promise(resolve =>
      setTimeout(resolve, timeout),
    ).then(() => {
      if (!result) {
        result = {
          type: 'timeout',
          pauseReason: this._backends[0]?.getPauseReason(),
          timeout,
          watcher,
        };
      }
    });
    const startTime = performance.now();
    debug('Creating health check cookie: %s', healthCheckPath);
    const creationPromise = fs.promises
      .writeFile(healthCheckPath, String(startTime))
      .catch(error => {
        if (!result) {
          result = {
            type: 'error',
            error,
            timeout,
            watcher,
          };
        }
      });
    const observationPromise = new Promise(resolve => {
      this._pendingHealthChecks.set(basename, resolve);
    }).then(() => {
      if (!result) {
        result = {
          type: 'success',
          timeElapsed: performance.now() - startTime,
          timeout,
          watcher,
        };
      }
    });
    await Promise.race([
      timeoutPromise,
      creationPromise.then(() => observationPromise),
    ]);
    this._pendingHealthChecks.delete(basename);
    // Chain a deletion to the creation promise (which may not have even settled yet!),
    // don't await it, and swallow errors. This is just best-effort cleanup.
    creationPromise.then(() =>
      fs.promises.unlink(healthCheckPath).catch(() => {}),
    );
    debug('Health check result: %o', result);
    return nullthrows(result);
  }
}
