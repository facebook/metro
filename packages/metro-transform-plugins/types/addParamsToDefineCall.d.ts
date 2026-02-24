/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<7b35f4001b105ee1f3612e8a0027a482>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-transform-plugins/src/addParamsToDefineCall.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
