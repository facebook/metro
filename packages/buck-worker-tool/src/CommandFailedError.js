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

/**
 * Thrown to indicate the command failed and already output relevant error
 * information on the console.
 */
class CommandFailedError extends Error {
  constructor() {
    super(
      'The Buck worker-tool command failed. Diagnostics should have ' +
        'been printed on the standard error output.',
    );
  }
}

module.exports = CommandFailedError;
