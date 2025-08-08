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

import fs from 'fs';
import path from 'path';

export default class Package {
  path: string;

  _root: string;
  _content: ?PackageJson;

  constructor({file}: {file: string, ...}) {
    this.path = path.resolve(file);
    this._root = path.dirname(this.path);
    this._content = null;
  }

  invalidate() {
    this._content = null;
  }

  read(): PackageJson {
    if (this._content == null) {
      this._content = JSON.parse(fs.readFileSync(this.path, 'utf8'));
    }
    return this._content;
  }
}
