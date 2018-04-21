/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

// TODO(cpojer): Create a jest-types repo.
export type HasteFS = {
  exists(filePath: string): boolean,
  getAllFiles(): Array<string>,
  getModuleName(filePath: string): ?string,
  getSha1(string): ?string,
  matchFiles(pattern: RegExp | string): Array<string>,
};
