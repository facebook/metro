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

// rootDir must be normalized and absolute, filename may be any absolute path.
// (but will optimally start with rootDir)
export function relative(rootDir: string, filename: string): string {
  if (filename.indexOf(rootDir + path.sep) === 0) {
    const relativePath = filename.substr(rootDir.length + 1);
    // Allow any sequence of indirection fragments at the start of the path,
    // e.g ../../foo, but bail out to Node's path.relative if we find a
    // possible indirection after any other segment, or a leading "./".
    for (let i = 0; ; i += UP_FRAGMENT_LENGTH) {
      const nextIndirection = relativePath.indexOf(CURRENT_FRAGMENT, i);
      if (nextIndirection === -1) {
        return relativePath;
      }
      if (
        nextIndirection !== i + 1 || // Fallback when ./ later in the path, or leading
        relativePath[i] !== '.' // and for anything other than a leading ../
      ) {
        return path.relative(rootDir, filename);
      }
    }
  }
  return path.relative(rootDir, filename);
}

const UP_FRAGMENT = '..' + path.sep;
const UP_FRAGMENT_LENGTH = UP_FRAGMENT.length;
const CURRENT_FRAGMENT = '.' + path.sep;

// Optimise for the case where we're often repeatedly dealing with the same
// root by caching just the most recent.
let cachedDirName = null;
let dirnameCache = [];

// rootDir must be an absolute path and normalPath must be a normal relative
// path (e.g.: foo/bar or ../foo/bar, but never ./foo or foo/../bar)
// As of Node 18 this is several times faster than path.resolve, over
// thousands of real calls with 1-3 levels of indirection.
export function resolve(rootDir: string, normalPath: string): string {
  let left = rootDir;
  let i = 0;
  let pos = 0;
  while (
    normalPath.startsWith(UP_FRAGMENT, pos) ||
    (normalPath.endsWith('..') && normalPath.length === 2 + pos)
  ) {
    if (i === 0 && cachedDirName !== rootDir) {
      dirnameCache = [];
      cachedDirName = rootDir;
    }
    if (dirnameCache.length === i) {
      dirnameCache.push(path.dirname(left));
    }
    left = dirnameCache[i++];
    pos += UP_FRAGMENT_LENGTH;
  }
  const right = pos === 0 ? normalPath : normalPath.slice(pos);
  if (right.length === 0) {
    return left;
  }
  // left may already end in a path separator only if it is a filesystem root,
  // '/' or 'X:\'.
  if (left.endsWith(path.sep)) {
    return left + right;
  }
  return left + path.sep + right;
}
