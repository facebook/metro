/**
 * Copyright (c) 2018-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const rimraf = require('rimraf');

export type Options = {|
  root: string,
|};

class FileStore<T> {
  _root: string;

  constructor(options: Options) {
    this._root = options.root;
    this._createDirs();
  }

  get(key: Buffer): ?T {
    try {
      return JSON.parse(fs.readFileSync(this._getFilePath(key), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null;
      }

      throw err;
    }
  }

  set(key: Buffer, value: T): void {
    fs.writeFileSync(this._getFilePath(key), JSON.stringify(value));
  }

  clear() {
    this._removeDirs();
    this._createDirs();
  }

  _getFilePath(key: Buffer): string {
    return path.join(
      this._root,
      key.slice(0, 1).toString('hex'),
      key.slice(1).toString('hex'),
    );
  }

  _createDirs() {
    for (let i = 0; i < 256; i++) {
      mkdirp.sync(path.join(this._root, ('0' + i.toString(16)).slice(-2)));
    }
  }

  _removeDirs() {
    for (let i = 0; i < 256; i++) {
      rimraf.sync(path.join(this._root, ('0' + i.toString(16)).slice(-2)));
    }
  }
}

module.exports = FileStore;
