/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 */

'use strict';

function createModuleIdFactory(): (path: string) => number {
  const fileToIdMap = new Map();
  let nextId = 0;
  return (path: string) => {
    if (!fileToIdMap.has(path)) {
      fileToIdMap.set(path, nextId);
      nextId += 1;
    }
    return fileToIdMap.get(path);
  };
}

module.exports = createModuleIdFactory;
