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

'use strict';

import type ModuleCache from './ModuleCache';
import type Package from './Package';

import path from 'path';

class Module {
  path: string;

  _moduleCache: ModuleCache;
  _sourceCode: ?string;

  constructor(file: string, moduleCache: ModuleCache) {
    if (!path.isAbsolute(file)) {
      throw new Error('Expected file to be absolute path but got ' + file);
    }

    this.path = file;
    this._moduleCache = moduleCache;
  }

  getPackage(): ?Package {
    return this._moduleCache.getPackageForModule(this);
  }

  invalidate() {}
}

module.exports = Module;
