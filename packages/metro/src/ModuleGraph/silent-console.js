/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */
'use strict';

const {Console} = require('console');
const {Writable} = require('stream');

const write = (_, __, callback) => callback();
module.exports = new Console(new Writable({write, writev: write}));
