/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/**
 * Simple way of adding additional parameters to the end of the define calls.
 *
 * This is used to add extra information to the generaic compiled modules (like
 * the dependencyMap object or the list of inverse dependencies).
 */
declare function addParamsToDefineCall(
  code: string,
  ...paramsToAdd: Array<unknown>
): string;
export default addParamsToDefineCall;
