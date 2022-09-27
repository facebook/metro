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

/*::
export type * from './Worker.flow';
*/

try {
  require('metro-babel-register').unstable_registerForMetroMonorepo();
} catch {}

module.exports = require('./Worker.flow');
