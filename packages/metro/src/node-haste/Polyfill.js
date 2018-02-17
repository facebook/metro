/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const Module = require('./Module');

import type {ConstructorArgs} from './Module';

class Polyfill extends Module {
  _id: string;
  _dependencies: Array<string>;

  constructor(
    options: ConstructorArgs & {
      id: string,
      dependencies: Array<string>,
    },
  ) {
    super(options);
    this._id = options.id;
    this._dependencies = options.dependencies;
  }

  isHaste() {
    return false;
  }

  getName() {
    return this._id;
  }

  getPackage() {
    return null;
  }

  async getDependencies() {
    return this._dependencies;
  }

  isPolyfill() {
    return true;
  }
}

module.exports = Polyfill;
