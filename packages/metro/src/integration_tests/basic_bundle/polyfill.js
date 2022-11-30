/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

// Inject something into the global object so we can verify that this file
// is indeed evaluated.
global.POLYFILL_IS_INJECTED = 'POLYFILL_IS_INJECTED';
