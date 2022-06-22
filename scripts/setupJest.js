/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

global.Promise = require('promise');

// Make sure nothing registers Babel on top of Jest's setup during tests.
require('metro-babel-register').unstable_registerForMetroMonorepo = () => {};
