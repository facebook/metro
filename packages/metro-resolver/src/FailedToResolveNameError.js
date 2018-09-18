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

class FailedToResolveNameError extends Error {
  modulePaths: $ReadOnlyArray<string>;

  constructor(modulePaths: $ReadOnlyArray<string>) {
    const hint = modulePaths.length ? ' or at these locations:' : '';
    super(
      `Module does not exist in the Haste module map${hint}\n` +
        modulePaths.map(modulePath => `  ${modulePath}\n`).join(', ') +
        '\n',
    );

    this.modulePaths = modulePaths;
  }
}

module.exports = FailedToResolveNameError;
