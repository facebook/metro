/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

'use strict';

import type {PackageJson} from 'metro-resolver/src/types';

import {getSubpathReplacements} from 'metro-resolver/src/PackageResolve';

const fs = require('fs');
const path = require('path');

class Package {
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

  redirectRequire(
    name: string,
    mainFields: $ReadOnlyArray<string>,
  ): string | false {
    const replacements = getSubpathReplacements(this.read(), mainFields);

    if (!replacements) {
      return name;
    }

    if (!name.startsWith('.') && !path.isAbsolute(name)) {
      const replacement = replacements[name];
      // support exclude with "someDependency": false
      return replacement === false ? false : replacement || name;
    }

    let relPath =
      './' + path.relative(this._root, path.resolve(this._root, name));

    if (path.sep !== '/') {
      relPath = relPath.replace(new RegExp('\\' + path.sep, 'g'), '/');
    }

    let redirect = replacements[relPath];

    // false is a valid value
    if (redirect == null) {
      redirect = replacements[relPath + '.js'];
      if (redirect == null) {
        redirect = replacements[relPath + '.json'];
      }
    }

    // support exclude with "./someFile": false
    if (redirect === false) {
      return false;
    }

    if (redirect) {
      return path.join(this._root, redirect);
    }

    return name;
  }

  read(): PackageJson {
    if (this._content == null) {
      this._content = JSON.parse(fs.readFileSync(this.path, 'utf8'));
    }
    return this._content;
  }
}

module.exports = Package;
