/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

import * as path from 'path';

let normalizePathSeparatorsToSystem: (string: string) => string;
if (path.sep === '/') {
  normalizePathSeparatorsToSystem = (filePath: string): string => filePath;
} else {
  normalizePathSeparatorsToSystem = (filePath: string): string =>
    filePath.replace(/\//g, path.sep);
}

export default normalizePathSeparatorsToSystem;
