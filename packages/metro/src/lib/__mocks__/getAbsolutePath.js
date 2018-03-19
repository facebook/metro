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

const path = require('path');

module.exports = (file: string, roots: $ReadOnlyArray<string>): string =>
  path.resolve(roots[0], file);
