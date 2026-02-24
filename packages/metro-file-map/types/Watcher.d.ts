/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<7537b04fdc97fb54ebddaebf60605405>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/Watcher.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {
  Console,
  CrawlerOptions,
  FileData,
  Path,
  PerfLogger,
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
  constructor(options: WatcherOptions);
  crawl(): Promise<CrawlResult>;
  watch(onChange: (change: WatcherBackendChangeEvent) => void): void;
  close(): void;
  checkHealth(timeout: number): Promise<HealthCheckResult>;
}
