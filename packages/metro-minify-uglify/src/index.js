/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const minifier = require('./minifier');

export type {MetroMinifier} from './types.js.flow';
export type {ResultWithMap} from './types.js.flow';
export type {ResultWithoutMap} from './types.js.flow';

module.exports = minifier;
