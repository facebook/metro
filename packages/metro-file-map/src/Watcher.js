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

const debug = require('debug')('Metro:Watcher');

const MAX_WAIT_TIME = 240000;

type WatcherOptions = {
  abortSignal: AbortSignal,
  computeSha1: boolean,
  console: Console,
  enableSymlinks: boolean,
  extensions: $ReadOnlyArray<string>,
  forceNodeFilesystemAPI: boolean,
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
  close(): Promise<void>;
}

export class Watcher {
  _options: WatcherOptions;
  _backends: $ReadOnlyArray<WatcherBackend> = [];

  constructor(options: WatcherOptions) {
    this._options = options;
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
    const ignore = (filePath: string) => options.ignore(filePath);
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

    const createWatcherBackend = (root: Path): Promise<WatcherBackend> => {
      const watcherOptions: WatcherBackendOptions = {
        dot: true,
        glob: [
          // Ensure we always include package.json files, which are crucial for
          /// module resolution.
          '**/package.json',
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
          watcher.on('all', onChange);
          resolve(watcher);
        });
      });
    };

    this._backends = await Promise.all(
      this._options.roots.map(createWatcherBackend),
    );
  }

  async close() {
    await Promise.all(this._backends.map(watcher => watcher.close()));
  }
}
