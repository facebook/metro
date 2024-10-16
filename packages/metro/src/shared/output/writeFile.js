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

const fs = require('fs');
const throat = require('throat');

const writeFile: typeof fs.promises.writeFile = throat(
  128,
  fs.promises.writeFile,
);

module.exports = writeFile;
