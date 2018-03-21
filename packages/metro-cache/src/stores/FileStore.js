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

import type {TransformedCode} from 'metro/src/JSTransformer/worker';

export type Options = {|
  root: string,
|};

const JOINER_DATA = '\0\0';
const JOINER_LIST = '\0';

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
      const data = fs.readFileSync(this._getFilePath(key), 'utf8');
      const [code, dependencies, map] = data.split(JOINER_DATA);

      return {
        code,
        dependencies: dependencies ? dependencies.split(JOINER_LIST) : [],
        map: JSON.parse(map),
      };
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null;
      }

      throw err;
    }
  }

  set(key: Buffer, value: TransformedCode): void {
    const data = [
      value.code,
      value.dependencies.join(JOINER_LIST),
      JSON.stringify(value.map),
    ].join(JOINER_DATA);

    fs.writeFileSync(this._getFilePath(key), data);
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
