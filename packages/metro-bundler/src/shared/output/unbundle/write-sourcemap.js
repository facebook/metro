/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */
'use strict';

const writeFile = require('../writeFile');

function writeSourcemap(
  fileName: string,
  contents: string,
  log: (...args: Array<string>) => void,
/* $FlowFixMe(>=0.54.0 site=react_native_fb) This comment suppresses an error
 * found when Flow v0.54 was deployed. To see the error delete this comment and
 * run Flow. */
): Promise<> {
  if (!fileName) {
    return Promise.resolve();
  }
  log('Writing sourcemap output to:', fileName);
  const writeMap = writeFile(fileName, contents, null);
  writeMap.then(() => log('Done writing sourcemap output'));
  return writeMap;
}

module.exports = writeSourcemap;
