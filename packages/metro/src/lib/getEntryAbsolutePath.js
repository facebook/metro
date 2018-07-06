/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const getAbsolutePath = require('./getAbsolutePath');
const path = require('path');

import type {ServerOptions} from '../shared/types.flow';

function getEntryAbsolutePath(
  options: ServerOptions,
  entryFile: string,
): string {
  if (options.projectRoot) {
    return path.resolve(options.projectRoot, entryFile);
  }
  return getAbsolutePath(entryFile, options.watchFolders);
}

module.exports = getEntryAbsolutePath;
