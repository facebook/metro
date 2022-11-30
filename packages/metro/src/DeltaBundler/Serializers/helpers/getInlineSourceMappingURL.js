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

function getInlineSourceMappingURL(sourceMap: string): string {
  const base64 = Buffer.from(sourceMap).toString('base64');
  return `data:application/json;charset=utf-8;base64,${base64}`;
}

module.exports = getInlineSourceMappingURL;
