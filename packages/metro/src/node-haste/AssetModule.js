/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const Module = require('./Module');

import type {CachedReadResult, ConstructorArgs, ReadResult} from './Module';

class AssetModule extends Module {
  _dependencies: Array<string>;

  constructor(args: ConstructorArgs & {dependencies: Array<string>}) {
    super(args);
    this._dependencies = args.dependencies || [];
  }

  getPackage() {
    return null;
  }

  isHaste() {
    return false;
  }

  readCached(): CachedReadResult {
    return {
      /** $FlowFixMe: improper OOP design. AssetModule, being different from a
       * normal Module, shouldn't inherit it in the first place. */
      result: {dependencies: this._dependencies},
      outdatedDependencies: [],
    };
  }

  /** $FlowFixMe: improper OOP design. */
  readFresh(): Promise<ReadResult> {
    return Promise.resolve({dependencies: this._dependencies});
  }

  hash() {
    return `AssetModule : ${this.path}`;
  }

  isAsset() {
    return true;
  }
}

module.exports = AssetModule;
