/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

'use strict';

function debug(namespace: string): (...Array<mixed>) => void {
  return () => {};
}

debug.enable = (match: string) => {};
debug.disable = () => {};

module.exports = debug;
