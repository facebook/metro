/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

const babelRegister = require('metro-babel-register');
const path = require('path');

const rootPath = path.resolve(
  path.dirname(require.resolve('metro/package.json')),
  '../../..',
);
babelRegister(babelRegister.buildRegExps(rootPath, ['metro/packages/']));

module.exports = require('metro/src/DeltaBundler/Worker');
