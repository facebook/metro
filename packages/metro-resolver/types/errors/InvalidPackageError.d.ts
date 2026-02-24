/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<47b272bf4a763f5c68eed66346ee74e9>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/errors/InvalidPackageError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {FileCandidates} from '../types';

declare class InvalidPackageError extends Error {
  /**
   * The file candidates we tried to find to resolve the `main` field of the
   * package. Ex. `/js/foo/beep(.js|.json)?` if `main` is specifying `./beep`
   * as the entry point.
   */
  fileCandidates: FileCandidates;
  /**
   * The 'index' file candidates we tried to find to resolve the `main` field of
   * the package. Ex. `/js/foo/beep/index(.js|.json)?` if `main` is specifying
   * `./beep` as the entry point.
   */
  indexCandidates: FileCandidates;
  /**
   * The full path to the main module that was attempted.
   */
  mainModulePath: string;
  /**
   * Full path the package we were trying to resolve.
   * Ex. `/js/foo/package.json`.
   */
  packageJsonPath: string;
  constructor(opts: {
    readonly fileCandidates: FileCandidates;
    readonly indexCandidates: FileCandidates;
    readonly mainModulePath: string;
    readonly packageJsonPath: string;
  });
}
export default InvalidPackageError;
