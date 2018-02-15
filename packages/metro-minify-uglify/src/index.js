/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const minifier = require('./minifier');

export type {MetroMinifier} from './types.js.flow';
export type {ResultWithMap} from './types.js.flow';
export type {ResultWithoutMap} from './types.js.flow';

module.exports = minifier;
