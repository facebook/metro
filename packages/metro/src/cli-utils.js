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

const fs = require('fs-extra');

exports.watchFile = async function(
  filename: string,
  callback: () => *,
): Promise<void> {
  fs.watchFile(filename, () => {
    callback();
  });

  await callback();
};

exports.makeAsyncCommand = (command: (argv: any) => Promise<*>) => (
  // eslint-disable-next-line lint/no-unclear-flowtypes
  argv: any,
) => {
  Promise.resolve(command(argv)).catch(error => {
    console.error(error.stack);
    process.exitCode = 1;
  });
};
