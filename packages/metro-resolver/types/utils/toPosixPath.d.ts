/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/**
 * Replace path separators in the passed string to coerce to a POSIX path. This
 * is a no-op on POSIX systems.
 */
declare function toPosixPath(relativePathOrSpecifier: string): string;
export default toPosixPath;
