/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<82eea6ba303c71a4471aa94a516ef33b>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/ProjectRouteMap.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {ConfigT} from 'metro-config';
/**
 * Immutable bidirectional map between URL pathnames and filesystem paths,
 * encoding the `[metro-project]` and `[metro-watchFolders]` virtual prefix
 * conventions.
 */
declare class ProjectRouteMap {
  readonly serverRootDir: string;
  readonly _projectRootDirPrefix: string;
  readonly _watchFolderDirPrefixes: ReadonlyArray<string>;
  readonly _filePathRoutes: ReadonlyArray<{
    rootDirPrefix: string;
    pathnamePrefix: string;
  }>;
  constructor(config: ConfigT);
  /**
   * Decode a URL pathname and resolve it to an absolute filesystem path.
   */
  filePathOfUrlPathname(pathname: string): string | null;
  /**
   * Convert a URL pathname or entry-file path to an absolute filesystem path.
   *
   * Accepts both URL-style (`/[metro-watchFolders]/1/foo`) and entry-file-style
   * (`./[metro-watchFolders]/1/foo`) prefixes.
   *
   * Returns `null` when the pathname does not match a known virtual prefix,
   * or for out-of-bounds watchFolder indices.
   */
  filePathOfUrlDecodedPathname(pathname: string): string | null;
  /**
   * Convert an absolute filesystem path to a URL pathname using the first
   * matching virtual prefix.
   *
   * Falls back to the absolute path (as a POSIX-style URL) when the file is
   * not under any configured route.
   */
  urlPathnameOfFilePath(filePath: string): string;
}
export default ProjectRouteMap;
