/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 *
 */

import type {
  Console,
  CrawlerOptions,
  FileData,
  Path,
  PerfLogger,
  WatcherBackend,
  WatcherBackendChangeEvent,
  WatchmanClocks,
} from './flow-types';

import EventEmitter from 'events';

type CrawlResult = {
  changedFiles: FileData;
  clocks?: WatchmanClocks;
  removedFiles: Set<Path>;
};
type WatcherOptions = {
  abortSignal: AbortSignal;
  computeSha1: boolean;
  console: Console;
  enableSymlinks: boolean;
  extensions: ReadonlyArray<string>;
  forceNodeFilesystemAPI: boolean;
  healthCheckFilePrefix: string;
  ignoreForCrawl: (filePath: string) => boolean;
  ignorePatternForWatch: RegExp;
  previousState: CrawlerOptions['previousState'];
  perfLogger: null | undefined | PerfLogger;
  roots: ReadonlyArray<string>;
  rootDir: string;
  useWatchman: boolean;
  watch: boolean;
  watchmanDeferStates: ReadonlyArray<string>;
};
export type HealthCheckResult =
  | {
      type: 'error';
      timeout: number;
      error: Error;
      watcher: null | undefined | string;
    }
  | {
      type: 'success';
      timeout: number;
      timeElapsed: number;
      watcher: null | undefined | string;
    }
  | {
      type: 'timeout';
      timeout: number;
      watcher: null | undefined | string;
      pauseReason: null | undefined | string;
    };
export declare class Watcher extends EventEmitter {
  _options: WatcherOptions;
  _backends: ReadonlyArray<WatcherBackend>;
  _instanceId: number;
  _nextHealthCheckId: number;
  _pendingHealthChecks: Map<string, () => void>;
  _activeWatcher: null | undefined | string;
  constructor(options: WatcherOptions);
  crawl(): Promise<CrawlResult>;
  watch(onChange: (change: WatcherBackendChangeEvent) => void): void;
  _handleHealthCheckObservation(basename: string): void;
  close(): void;
  checkHealth(timeout: number): Promise<HealthCheckResult>;
}
