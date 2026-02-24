/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<5ecdb559fce5f5c6ed50df6e4eaebf20>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/lib/RootPathUtils.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
