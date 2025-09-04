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

export const normalizePathSeparatorsToPosix: string => string =
  path.sep === '/'
    ? filePath => filePath
    : filePath => filePath.replaceAll('\\', '/');
