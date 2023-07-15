/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

import path from 'path';

const MATCH_NON_POSIX_PATH_SEPS = new RegExp('\\' + path.win32.sep, 'g');

/**
 * Replace path separators in the passed string to coerce to a POSIX path. This
 * is a no-op on POSIX systems.
 */
export default function toPosixPath(relativePathOrSpecifier: string): string {
  if (path.sep === path.posix.sep) {
    return relativePathOrSpecifier;
  }

  return relativePathOrSpecifier.replace(
    MATCH_NON_POSIX_PATH_SEPS,
    path.posix.sep,
  );
}
