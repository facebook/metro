/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const isAbsolutePath = require('absolute-path');

import type ModuleCache from './ModuleCache';
import type {LocalPath} from './lib/toLocalPath';

export type ConstructorArgs = {
  file: string,
  localPath: LocalPath,
  moduleCache: ModuleCache,
};

class Module {
  localPath: LocalPath;
  path: string;

  _moduleCache: ModuleCache;
  _sourceCode: ?string;

  constructor({file, localPath, moduleCache}: ConstructorArgs) {
    if (!isAbsolutePath(file)) {
      throw new Error('Expected file to be absolute path but got ' + file);
    }

    this.localPath = localPath;
    this.path = file;

    this._moduleCache = moduleCache;
  }

  getPackage() {
    return this._moduleCache.getPackageForModule(this);
  }

  invalidate() {}
}

module.exports = Module;
