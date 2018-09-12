/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const {relative} = require('path');

declare class OpaqueLocalPath {}
export type LocalPath = OpaqueLocalPath & string;

// FIXME: This function has the shortcoming of potentially returning identical
// paths for two files in different roots.
function toLocalPath(
  roots: $ReadOnlyArray<string>,
  absolutePath: string,
): LocalPath {
  for (let i = 0; i < roots.length; i++) {
    const localPath = relative(roots[i], absolutePath);
    if (!localPath.startsWith('../') && localPath !== '..') {
      return (localPath: any);
    }
  }

  throw new Error(
    `Expected path \`${absolutePath}\` to be relative to one of the project roots`,
  );
}

module.exports = toLocalPath;
