/**
 * Copyright (c) 2016-present, Facebook, Inc.
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

/**
 * By knowing all the valid platforms, we're able to say that "foo.ios.png" is
 * effectively the asset "foo" specific to "ios", and not a generic asset
 * "foo.ios". This is important so that we can discard asset variants that don't
 * match the platform being built.
 */
const VALID_PLATFORMS: Set<string> = new Set(['ios', 'android', 'web']);

module.exports = {VALID_PLATFORMS};
