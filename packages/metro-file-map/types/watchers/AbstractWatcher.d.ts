/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import type {
  WatcherBackend,
  WatcherBackendChangeEvent,
  WatcherBackendOptions,
} from '../flow-types';

export type Listeners = Readonly<{
  onFileEvent: (event: WatcherBackendChangeEvent) => void;
  onError: (error: Error) => void;
}>;
export declare class AbstractWatcher implements WatcherBackend {
  readonly root: string;
  readonly ignored: null | undefined | RegExp;
  readonly globs: ReadonlyArray<string>;
  readonly dot: boolean;
  readonly doIgnore: (path: string) => boolean;
  constructor(dir: string, opts: WatcherBackendOptions);
  onFileEvent(listener: (event: WatcherBackendChangeEvent) => void): () => void;
  onError(listener: (error: Error) => void): () => void;
  startWatching(): Promise<void>;
  stopWatching(): Promise<void>;
  emitFileEvent(event: Omit<WatcherBackendChangeEvent, 'root'>): void;
  emitError(error: Error): void;
  getPauseReason(): null | undefined | string;
}
