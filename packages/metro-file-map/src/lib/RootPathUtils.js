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

const UP_FRAGMENT = '..' + path.sep;
const UP_FRAGMENT_LENGTH = UP_FRAGMENT.length;
const CURRENT_FRAGMENT = '.' + path.sep;

export class RootPathUtils {
  #rootDir: string;
  #rootDirnamesCache: Array<string> = [];

  constructor(rootDir: string) {
    this.#rootDir = rootDir;
  }

  // absolutePath may be any well-formed absolute path.
  absoluteToNormal(absolutePath: string): string {
    if (absolutePath.indexOf(this.#rootDir + path.sep) === 0) {
      const relativePath = absolutePath.substr(this.#rootDir.length + 1);
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
          return path.relative(this.#rootDir, absolutePath);
        }
      }
    }
    return path.relative(this.#rootDir, absolutePath);
  }

  // `normalPath` is assumed to be normal (root-relative, no redundant
  // indirection), per the definition above.
  normalToAbsolute(normalPath: string): string {
    let left = this.#rootDir;
    const rootDirnames = this.#rootDirnamesCache;
    let i = 0;
    let pos = 0;
    while (
      normalPath.startsWith(UP_FRAGMENT, pos) ||
      (normalPath.endsWith('..') && normalPath.length === 2 + pos)
    ) {
      if (rootDirnames.length === i) {
        rootDirnames.push(path.dirname(left));
      }
      left = rootDirnames[i++];
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
}
