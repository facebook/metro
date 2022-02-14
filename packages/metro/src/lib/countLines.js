/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const newline = /\r\n?|\n|\u2028|\u2029/g;

const countLines = (string: string): number =>
  (string.match(newline) || []).length + 1;

module.exports = countLines;
