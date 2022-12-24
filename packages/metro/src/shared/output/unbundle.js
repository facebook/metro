/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

'use strict';

/* This is for retro-compatibility of React Native with older versions of
 * Metro. Use the `RamBundle` module directly. */
module.exports = require('./RamBundle');
