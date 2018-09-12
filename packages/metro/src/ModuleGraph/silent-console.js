/**
 * Copyright (c) Facebook, Inc. and its affiliates.
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

const write = (_, __, callback) => callback();
module.exports = new Console(new Writable({write, writev: write}));
