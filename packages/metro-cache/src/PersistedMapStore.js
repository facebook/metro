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
const serializer = require('jest-serializer');

export type Options = {|
  path: string,
  writeDelay: ?number,
|};

class PersistedMapStore {
  _map: ?Map<string, mixed>;
  _path: string;
  _store: () => void;
  _timeout: ?TimeoutID;
  _writeDelay: number;

  constructor(options: Options) {
    this._path = options.path;
    this._writeDelay = options.writeDelay || 5000;

    this._store = this._store.bind(this);
    this._timeout = null;
    this._map = null;
  }

  get(key: Buffer): mixed {
    this._getMap();

    if (this._map) {
      return this._map.get(key.toString('hex'));
    }

    return null;
  }

  set(key: Buffer, value: mixed) {
    this._getMap();

    if (this._map) {
      this._map.set(key.toString('hex'), value);
    }

    if (!this._timeout) {
      this._timeout = setTimeout(this._store, this._writeDelay);
    }
  }

  _getMap() {
    if (!this._map) {
      if (fs.existsSync(this._path)) {
        this._map = serializer.readFileSync(this._path);
      } else {
        this._map = new Map();
      }
    }
  }

  _store() {
    serializer.writeFileSync(this._path, this._map);
    this._timeout = null;
  }
}

module.exports = PersistedMapStore;
