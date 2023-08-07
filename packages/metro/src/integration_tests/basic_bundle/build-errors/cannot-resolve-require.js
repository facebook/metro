/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

// $FlowExpectedError[cannot-resolve-module]
import type DoesNotExistT from './does-not-exist';

// $FlowExpectedError[cannot-resolve-module]
const DoesNotExist = require('./does-not-exist');

global.x = (DoesNotExist: DoesNotExistT);
