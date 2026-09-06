/**
 * Portions (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

/**
 * Copyright 2013 Naitik Shah
 *
 * Vendored from the `walker` package, version 1.0.8, and licensed under the
 * Apache License 2.0 found in LICENSE.APACHE2 in this directory:
 * https://github.com/daaku/nodejs-walker
 */

import type {Stats} from 'node:fs';

import EventEmitter from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

type EntryListener = (entry: string, stat: Stats) => void;

type EventListeners = {
  blockDevice: EntryListener,
  characterDevice: EntryListener,
  dir: EntryListener,
  end: () => void,
  entry: EntryListener,
  error: (error: Error, entry: string, stat: ?Stats) => void,
  fifo: EntryListener,
  file: EntryListener,
  socket: EntryListener,
  symlink: EntryListener,
};

type EntryEvent = Exclude<keyof EventListeners, 'end' | 'entry' | 'error'>;

/**
 * Emitted when the type of an entry could not be determined.
 */
export class UnknownFileTypeError extends Error {
  constructor(entry: string) {
    super(`The type of ${entry} could not be determined.`);
    this.name = 'UnknownFileTypeError';
  }
}

/**
 * To walk a directory. It's complicated (but it's async, so it must be fast).
 *
 * Walking starts as soon as the walker is constructed, so listeners must be
 * attached synchronously.
 */
export default class Walker {
  #emitter: EventEmitter = new EventEmitter();
  #filterDir: (dir: string, stat: Stats) => boolean = () => true;
  #pending: number = 0;

  constructor(root: string) {
    this.#go(root);
  }

  on<TEvent extends keyof EventListeners>(
    event: TEvent,
    listener: EventListeners[TEvent],
  ): this {
    this.#emitter.on(event, listener);
    return this;
  }

  /**
   * Setup a function to filter out directory entries. It is given a directory
   * name, which if it returns true will include the directory and its
   * children.
   */
  filterDir(fn: (dir: string, stat: Stats) => boolean): this {
    this.#filterDir = fn;
    return this;
  }

  /**
   * Process a file or directory.
   */
  #go(entry: string): void {
    this.#pending++;

    fs.lstat(entry, (error, stat) => {
      if (error) {
        this.#emitter.emit('error', error, entry, null);
        this.#doneOne();
        return;
      }

      if (stat.isDirectory()) {
        if (!this.#filterDir(entry, stat)) {
          this.#doneOne();
          return;
        }

        fs.readdir(entry, (readdirError, files) => {
          if (readdirError) {
            this.#emitter.emit('error', readdirError, entry, stat);
            this.#doneOne();
            return;
          }

          this.#emitEntry('dir', entry, stat);
          for (const file of files) {
            this.#go(path.join(entry, file));
          }
          this.#doneOne();
        });
        return;
      }

      if (stat.isSymbolicLink()) {
        this.#emitEntry('symlink', entry, stat);
      } else if (stat.isBlockDevice()) {
        this.#emitEntry('blockDevice', entry, stat);
      } else if (stat.isCharacterDevice()) {
        this.#emitEntry('characterDevice', entry, stat);
      } else if (stat.isFIFO()) {
        this.#emitEntry('fifo', entry, stat);
      } else if (stat.isSocket()) {
        this.#emitEntry('socket', entry, stat);
      } else if (stat.isFile()) {
        this.#emitEntry('file', entry, stat);
      } else {
        this.#emitter.emit(
          'error',
          new UnknownFileTypeError(entry),
          entry,
          stat,
        );
      }
      this.#doneOne();
    });
  }

  #emitEntry(event: EntryEvent, entry: string, stat: Stats): void {
    this.#emitter.emit('entry', entry, stat);
    this.#emitter.emit(event, entry, stat);
  }

  #doneOne(): void {
    if (--this.#pending === 0) {
      this.#emitter.emit('end');
    }
  }
}
