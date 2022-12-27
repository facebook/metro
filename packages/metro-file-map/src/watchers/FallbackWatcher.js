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

/**
 * Originally vendored from https://github.com/amasad/sane/blob/64ff3a870c42e84f744086884bf55a4f9c22d376/src/node_watcher.js
 */

'use strict';

import type {WatcherOptions} from './common';
import type {ChangeEventMetadata} from '../flow-types';
import type {Dirent, FSWatcher} from 'fs';

const common = require('./common');
const {EventEmitter} = require('events');
const fs = require('fs');
const platform = require('os').platform();
const path = require('path');

const fsPromises = fs.promises;

const CHANGE_EVENT = common.CHANGE_EVENT;
const DELETE_EVENT = common.DELETE_EVENT;
const ADD_EVENT = common.ADD_EVENT;
const ALL_EVENT = common.ALL_EVENT;

module.exports = class FallbackWatcher extends EventEmitter {
  doIgnore: string => boolean;
  dot: boolean;
  globs: $ReadOnlyArray<string>;
  hasIgnore: boolean;
  ignored: ?(boolean | RegExp);
  root: string;
  watchmanDeferStates: $ReadOnlyArray<string>;

  +#directoryWatchers: Map<string, FSWatcher> = new Map();
  +#knownFiles: Set<string> = new Set();
  +#recentlyAdded: Map<string, TimeoutID> = new Map();

  constructor(dir: string, opts: WatcherOptions) {
    super();

    common.assignOptions(this, opts);

    this.root = path.resolve(dir);

    this.#recursiveScan(this.root, {emit: false})
      .then(() => this.emit('ready'))
      .catch(e => this.emit('error', e));
  }

  async #recursiveScan(
    fullPath: string,
    {emit}: {emit: boolean},
  ): Promise<void> {
    if (this.#directoryWatchers.has(fullPath)) {
      return;
    }
    const watcher = fs.watch(fullPath, (eventType, fileName) => {
      this.#onChange(fullPath, eventType, fileName).catch(e =>
        this.emit('error', e),
      );
    });
    watcher.on('error', error => {
      // Windows throws EPERM on watched folder deletion.
      // https://github.com/nodejs/node-v0.x-archive/issues/4337
      if (!(error.code === 'EPERM' && platform === 'win32')) {
        this.emit('error', error);
      }
    });

    this.#directoryWatchers.set(fullPath, watcher);

    if (emit) {
      this.#rawEmitEvent(ADD_EVENT, this.#relativePath(fullPath), {
        modifiedTime: null,
        size: null,
        type: 'd',
      });
    }

    const dirents = await fsPromises.readdir(fullPath, {withFileTypes: true});
    await Promise.all(
      dirents.map(async (dirent: Dirent): Promise<void> => {
        const childPath = path.join(fullPath, dirent.name.toString());
        if (dirent.isDirectory()) {
          await this.#recursiveScan(childPath, {emit});
        } else if (!this.#knownFiles.has(childPath)) {
          if (dirent.isSymbolicLink()) {
            this.#knownFiles.add(childPath);
          } else if (dirent.isFile() && !this.doIgnore(childPath)) {
            this.#knownFiles.add(childPath);
          }
          if (this.#knownFiles.has(childPath) && emit) {
            try {
              const stats = await fsPromises.lstat(childPath);

              const metadata = {
                modifiedTime: stats.mtime.getTime(),
                size: stats.size,
                type: stats.isSymbolicLink() ? 'l' : 'f',
              };
              this.#rawEmitEvent(
                ADD_EVENT,
                this.#relativePath(childPath),
                metadata,
              );
            } catch (error) {
              if (error.code === 'ENOENT') {
                this.#knownFiles.delete(childPath);
              } else {
                this.emit('error', error);
              }
            }
          }
        }
      }),
    );
  }

  #relativePath = (fullPath: string): string => {
    return path.relative(this.root, fullPath);
  };

  async #onChange(
    directory: string,
    eventType: 'change' | 'rename',
    fileName: string,
  ) {
    const fullPath = path.join(directory, fileName);
    try {
      const stats = await fsPromises.lstat(fullPath);
      if (stats.isDirectory()) {
        if (eventType === 'rename') {
          this.#recursiveScan(fullPath, {emit: true}).catch(e =>
            this.emit('error', e),
          );
        }
      } else {
        if (this.#knownFiles.has(fullPath)) {
          this.#rawEmitEvent(CHANGE_EVENT, this.#relativePath(fullPath), {
            modifiedTime: stats.mtime.getTime(),
            size: stats.size,
            type: stats.isSymbolicLink() ? 'l' : 'f',
          });
        } else if (stats.isSymbolicLink() || !this.doIgnore(fullPath)) {
          this.#knownFiles.add(fullPath);
          this.#rawEmitEvent(ADD_EVENT, this.#relativePath(fullPath), {
            modifiedTime: stats.mtime.getTime(),
            size: stats.size,
            type: stats.isSymbolicLink() ? 'l' : 'f',
          });
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        const directoryWatcher = this.#directoryWatchers.get(fullPath);
        if (directoryWatcher) {
          directoryWatcher.close();
          this.#directoryWatchers.delete(fullPath);
          this.#rawEmitEvent(DELETE_EVENT, this.#relativePath(fullPath));
        }
        if (this.#knownFiles.has(fullPath)) {
          this.#knownFiles.delete(fullPath);
          this.#rawEmitEvent(DELETE_EVENT, this.#relativePath(fullPath));
        }
      } else {
        this.emit('error', error);
      }
    }
  }

  #rawEmitEvent(
    eventType: string,
    file: string,
    metadata: ?ChangeEventMetadata,
  ) {
    if (eventType === ADD_EVENT) {
      const timeout = this.#recentlyAdded.get(file);
      if (timeout != null) {
        clearTimeout(timeout);
      }
      this.#recentlyAdded.set(
        file,
        setTimeout(() => this.#recentlyAdded.delete(file), 100),
      );
    } else if (eventType === CHANGE_EVENT) {
      if (this.#recentlyAdded.has(file)) {
        return;
      }
    } else {
      const timeout = this.#recentlyAdded.get(file);
      if (timeout != null) {
        clearTimeout(timeout);
        this.#recentlyAdded.delete(file);
      }
    }
    this.emit(eventType, file, this.root, metadata);
    this.emit(ALL_EVENT, eventType, file, this.root, metadata);
  }

  /**
   * End watching.
   */
  async close(): Promise<void> {
    for (const watcher of this.#directoryWatchers.values()) {
      watcher.close();
    }
    this.removeAllListeners();
  }
};
