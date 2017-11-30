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
 * Simple way of adding additional parameters to the end of the define calls.
 *
 * This is used to add extra information to the generaic compiled modules (like
 * the dependencyMap object or the list of inverse dependencies).
 */
function addParamsToDefineCall(
  code: string,
  ...paramsToAdd: Array<mixed>
): string {
  const index = code.lastIndexOf(')');
  const params = paramsToAdd.map(
    param => (param !== undefined ? JSON.stringify(param) : 'undefined'),
  );

  return code.slice(0, index) + ',' + params.join(',') + code.slice(index);
}

module.exports = addParamsToDefineCall;
