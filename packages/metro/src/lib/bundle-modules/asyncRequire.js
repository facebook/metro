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

// eslint-disable-next-line lint/flow-no-fixme
const dynamicRequire = (require: $FlowFixMe);
module.exports = function(moduleID: mixed): Promise<mixed> {
  return Promise.resolve().then(() => ({default: dynamicRequire(moduleID)}));
};
