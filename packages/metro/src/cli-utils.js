/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

const fs = require('fs');

exports.watchFile = async function (
  filename: string,
  callback: () => any,
): Promise<void> {
  fs.watchFile(filename, () => {
    callback();
  });

  await callback();
};

exports.makeAsyncCommand =
  <T>(command: (argv: T) => Promise<void>): ((argv: T) => void) =>
  (argv: T) => {
    Promise.resolve(command(argv)).catch(error => {
      console.error(error.stack);
      process.exitCode = 1;
    });
  };
