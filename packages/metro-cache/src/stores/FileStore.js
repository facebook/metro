/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
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

const NULL_BYTE = 0x00;
const NULL_BYTE_BUFFER = Buffer.from([NULL_BYTE]);

export type Options = {|
  root: string,
|};

class FileStore<T> {
  _root: string;

  constructor(options: Options) {
    this._root = options.root;
    this._createDirs();
  }

  async get(key: Buffer): Promise<?T> {
    try {
      const data = await fs.promises.readFile(this._getFilePath(key));

      if (data[0] === NULL_BYTE) {
        return (data.slice(1): any);
      }

      return JSON.parse(data.toString('utf8'));
    } catch (err) {
      if (err.code === 'ENOENT' || err instanceof SyntaxError) {
        return null;
      }

      throw err;
    }
  }

  async set(key: Buffer, value: T): Promise<void> {
    const filePath = this._getFilePath(key);
    try {
      await this._set(filePath, value);
    } catch (err) {
      if (err.code === 'ENOENT') {
        mkdirp.sync(path.dirname(filePath));
        await this._set(filePath, value);
      } else {
        throw err;
      }
    }
  }

  async _set(filePath: string, value: T): Promise<void> {
    let content;
    if (value instanceof Buffer) {
      content = Buffer.concat([NULL_BYTE_BUFFER, value]);
    } else {
      content = JSON.stringify(value) ?? JSON.stringify(null);
    }
    await fs.promises.writeFile(filePath, content);
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
