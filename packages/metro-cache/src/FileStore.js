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
const serializer = require('jest-serializer');

export type Options = {|
  root: string,
|};

class FileStore {
  _root: string;

  constructor(options: Options) {
    const root = options.root;

    for (let i = 0; i < 256; i++) {
      mkdirp.sync(path.join(root, ('0' + i.toString(16)).slice(-2)));
    }

    this._root = root;
  }

  get(key: Buffer): mixed {
    try {
      return serializer.readFileSync(this._getFilePath(key));
    } catch (err) {
      return null;
    }
  }

  set(key: Buffer, value: mixed): Promise<void> {
    return new Promise((resolve, reject) => {
      const data = serializer.serialize(value);

      fs.writeFile(this._getFilePath(key), data, err => {
        err ? reject(err) : resolve();
      });
    });
  }

  _getFilePath(key: Buffer): string {
    return path.join(
      this._root,
      key.slice(0, 1).toString('hex'),
      key.slice(1).toString('hex'),
    );
  }
}

module.exports = FileStore;
