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

declare module 'jest-util' {
  declare module.exports: {
    globsToMatcher(globs: $ReadOnlyArray<string>): string => boolean,
    replacePathSepForGlob(path: string): string,
  };
}
