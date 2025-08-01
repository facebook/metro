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

import path from 'path';

class Module {
  path: string;
  _sourceCode: ?string;

  constructor(file: string) {
    if (!path.isAbsolute(file)) {
      throw new Error('Expected file to be absolute path but got ' + file);
    }

    this.path = file;
  }
}

module.exports = Module;
