/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @flow
 */

'use strict';

// eslint-disable-next-line flow-no-fixme
const dynamicRequire = (require: $FlowFixMe);
module.exports = function(moduleID: mixed): Promise<mixed> {
  return Promise.resolve().then(() => ({default: dynamicRequire(moduleID)}));
};
