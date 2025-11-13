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

import type {PackageJson} from 'metro-resolver/private/types';

import path from 'path';

export default class Package {
  path: string;

  _root: string;
  _content: ?PackageJson;
  #readAndParse: () => PackageJson;

  constructor({
    file,
    readAndParse,
  }: {
    file: string,
    readAndParse: () => PackageJson,
    ...
  }) {
    this.path = path.resolve(file);
    this._root = path.dirname(this.path);
    this._content = null;
    this.#readAndParse = readAndParse;
  }

  invalidate() {
    this._content = null;
  }

  read(): PackageJson {
    if (this._content == null) {
      this._content = this.#readAndParse();
    }
    return this._content;
  }
}
