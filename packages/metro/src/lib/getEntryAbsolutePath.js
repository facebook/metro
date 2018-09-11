/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const getAbsolutePath = require('./getAbsolutePath');
const path = require('path');

import type {ConfigT} from 'metro-config/src/configTypes.flow';

function getEntryAbsolutePath(config: ConfigT, entryFile: string): string {
  if (config.projectRoot) {
    return path.resolve(config.projectRoot, entryFile);
  }
  return getAbsolutePath(entryFile, config.watchFolders);
}

module.exports = getEntryAbsolutePath;
