/**
 * Copyright (c) 2016-present, Facebook, Inc.
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

const crypto = require('crypto');
const fs = require('fs');

class CannotCreateTempDirError extends Error {
  constructor() {
    super("couldn't create a temporary directory");
  }
}

/**
 * Claim a temporary directory that doesn't exist already and that cannot be
 * predicted, so that nobody can race us to it. This is similar to `mkdtemp(3)`.
 */
function create(pathPrefix: string, mode: number): string {
  let resultPath;
  let i = 0;
  do {
    const rndBase64 = crypto.randomBytes(15).toString('base64');
    resultPath = pathPrefix + rndBase64.replace(/\//g, '-');
    if (++i === 10) {
      throw new CannotCreateTempDirError();
    }
  } while (!tryMkdirSync(resultPath, mode));
  return resultPath;
}

function tryMkdirSync(dirPath: string, mode?: number): boolean {
  try {
    fs.mkdirSync(dirPath, mode);
    return true;
  } catch (error) {
    if (error.code == 'EEXIST') {
      return false;
    }
    throw error;
  }
}

module.exports = {CannotCreateTempDirError, create, tryMkdirSync};
