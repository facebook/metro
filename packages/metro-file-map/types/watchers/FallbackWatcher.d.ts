/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/**
 * Originally vendored from https://github.com/amasad/sane/blob/64ff3a870c42e84f744086884bf55a4f9c22d376/src/node_watcher.js
 */

import type {
  ChangeEventMetadata,
  WatcherBackendChangeEvent,
} from '../flow-types';
import type {FSWatcher} from 'fs';

import {AbstractWatcher} from './AbstractWatcher';

declare class FallbackWatcher extends AbstractWatcher {
  readonly _dirRegistry: {[directory: string]: {[file: string]: true}};
  readonly watched: {[key: string]: FSWatcher};
  startWatching(): Promise<void>;
  /**
   * Register files that matches our globs to know what to type of event to
   * emit in the future.
   *
   * Registry looks like the following:
   *
   *  dirRegister => Map {
   *    dirpath => Map {
   *       filename => true
   *    }
   *  }
   *
   *  Return false if ignored or already registered.
   */
  _register(filepath: string, type: ChangeEventMetadata['type']): boolean;
  /**
   * Removes a file from the registry.
   */
  _unregister(filepath: string): void;
  /**
   * Removes a dir from the registry.
   */
  _unregisterDir(dirpath: string): void;
  /**
   * Checks if a file or directory exists in the registry.
   */
  _registered(fullpath: string): boolean;
  /**
   * Emit "error" event if it's not an ignorable event
   */
  _checkedEmitError: (error: Error) => void;
  /**
   * Watch a directory.
   */
  _watchdir: (dir: string) => boolean;
  /**
   * Stop watching a directory.
   */
  _stopWatching(dir: string): Promise<void>;
  /**
   * End watching.
   */
  stopWatching(): Promise<void>;
  /**
   * On some platforms, as pointed out on the fs docs (most likely just win32)
   * the file argument might be missing from the fs event. Try to detect what
   * change by detecting if something was deleted or the most recent file change.
   */
  _detectChangedFile(
    dir: string,
    event: string,
    callback: (file: string) => void,
  ): void;
  /**
   * Normalize fs events and pass it on to be processed.
   */
  _normalizeChange(dir: string, event: string, file: string): void;
  /**
   * Process changes.
   */
  _processChange(dir: string, event: string, file: string): void;
  /**
   * Emits the given event after debouncing, to emit only the latest
   * information when we receive several events in quick succession. E.g.,
   * Linux emits two events for every new file.
   *
   * See also note above for DEBOUNCE_MS.
   */
  _emitEvent(change: Omit<WatcherBackendChangeEvent, 'root'>): void;
  getPauseReason(): null | undefined | string;
}
export default FallbackWatcher;
