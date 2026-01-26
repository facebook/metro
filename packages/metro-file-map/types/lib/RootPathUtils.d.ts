/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

export declare class RootPathUtils {
  constructor(rootDir: string);
  getBasenameOfNthAncestor(n: number): string;
  getParts(): ReadonlyArray<string>;
  absoluteToNormal(absolutePath: string): string;
  normalToAbsolute(normalPath: string): string;
  relativeToNormal(relativePath: string): string;
  getAncestorOfRootIdx(normalPath: string): null | undefined | number;
  joinNormalToRelative(
    normalPath: string,
    relativePath: string,
  ): {normalPath: string; collapsedSegments: number};
  relative(from: string, to: string): string;
}
