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
  return filename.indexOf(rootDir + path.sep) === 0
    ? filename.substr(rootDir.length + 1)
    : path.relative(rootDir, filename);
}

const INDIRECTION_FRAGMENT = '..' + path.sep;
const INDIRECTION_FRAGMENT_LENGTH = INDIRECTION_FRAGMENT.length;

// rootDir must be an absolute path and normalPath must be a normal relative
// path (e.g.: foo/bar or ../foo/bar, but never ./foo or foo/../bar)
// As of Node 18 this is several times faster than path.resolve, over
// thousands of real calls with 1-3 levels of indirection.
export function resolve(rootDir: string, normalPath: string): string {
  if (normalPath.startsWith(INDIRECTION_FRAGMENT)) {
    const dirname = rootDir === '' ? '' : path.dirname(rootDir);
    return resolve(dirname, normalPath.slice(INDIRECTION_FRAGMENT_LENGTH));
  } else {
    return (
      rootDir +
      // If rootDir is the file system root, it will end in a path separator
      (rootDir.endsWith(path.sep) ? normalPath : path.sep + normalPath)
    );
  }
}
