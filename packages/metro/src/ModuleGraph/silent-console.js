/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

'use strict';

const {Console} = require('console');
const {Writable} = require('stream');

const write = (
  _: Buffer | string | Array<{chunk: Buffer | string, encoding: string, ...}>,
  __: string | ((error?: Error) => void),
  callback: void | ((error?: Error) => void),
  /* $FlowFixMe(>=0.97.0 site=react_native_fb) This comment suppresses an error
   * found when Flow v0.97 was deployed. To see the error delete this comment and
   * run Flow. */
) => callback();
module.exports = (new Console(new Writable({write, writev: write})): Console);
