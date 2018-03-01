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

import type {TransformedCode} from 'metro/src/JSTransformer/worker';

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

  get(key: Buffer): ?TransformedCode {
    try {
      return serializer.readFileSync(this._getFilePath(key));
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null;
      }

      throw err;
    }
  }

  set(key: Buffer, value: TransformedCode): void {
    fs.writeFileSync(this._getFilePath(key), serializer.serialize(value));
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
