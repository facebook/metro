/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const chalk = require('chalk');

module.exports = (date: Date): string =>
  chalk.dim(
    `[${date.toDateString()} ${date.toLocaleTimeString('en-US', {
      hour12: false,
    })}.${String(date.getMilliseconds()).padEnd(3, '0')}] `,
  );
