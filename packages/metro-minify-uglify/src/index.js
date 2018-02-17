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

const minifier = require('./minifier');

export type {MetroMinifier} from './types.js.flow';
export type {ResultWithMap} from './types.js.flow';
export type {ResultWithoutMap} from './types.js.flow';

module.exports = minifier;
