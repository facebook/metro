/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

'use strict';

const path = require('path');

const NODE_MODULES = path.sep + 'node_modules' + path.sep;

class DependencyGraphHelpers {
  _providesModuleNodeModules: Array<string>;
  _assetExts: Set<string>;

  constructor({
    providesModuleNodeModules,
    assetExts,
  }: {
    +providesModuleNodeModules: Array<string>,
    +assetExts: Array<string>,
  }) {
    this._providesModuleNodeModules = providesModuleNodeModules;
    this._assetExts = new Set(assetExts);
  }

  isNodeModulesDir(file: string) {
    const index = file.lastIndexOf(NODE_MODULES);
    if (index === -1) {
      return false;
    }

    const parts = file.substr(index + 14).split(path.sep);

    // Handle @scoped providesModuleNodeModules on both posix and win32
    if (
      parts.length >= 2 &&
      parts[0][0] === '@' &&
      this._providesModuleNodeModules.indexOf(parts[0] + '/' + parts[1]) > -1
    ) {
      return false;
    }

    const dirs = this._providesModuleNodeModules;
    for (let i = 0; i < dirs.length; i++) {
      if (parts.indexOf(dirs[i]) > -1) {
        return false;
      }
    }

    return true;
  }

  isAssetFile(file: string) {
    return this._assetExts.has(this.extname(file));
  }

  extname(name: string) {
    return path.extname(name).substr(1);
  }
}

module.exports = DependencyGraphHelpers;
