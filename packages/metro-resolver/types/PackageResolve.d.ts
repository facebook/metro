/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<20b836efd67d20258d429521857d8eab>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/PackageResolve.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {PackageInfo, PackageJson, ResolutionContext} from './types';
/**
 * Resolve the main entry point subpath for a package.
 *
 * Implements legacy (non-exports) package resolution behaviour based on the
 * ["browser" field spec](https://github.com/defunctzombie/package-browser-field-spec).
 */
export declare function getPackageEntryPoint(
  context: ResolutionContext,
  packageInfo: PackageInfo,
  platform: string | null,
): string;
/**
 * Get the resolved file path for the given import specifier based on any
 * `package.json` rules. Returns `false` if the module should be
 * [ignored](https://github.com/defunctzombie/package-browser-field-spec#ignore-a-module),
 * and returns the original path if no `package.json` mapping is matched. Does
 * not test file existence.
 *
 * Implements legacy (non-exports) package resolution behaviour based on the
 * ["browser" field spec](https://github.com/defunctzombie/package-browser-field-spec).
 */
export declare function redirectModulePath(
  context: Readonly<{
    getPackageForModule: ResolutionContext['getPackageForModule'];
    mainFields: ResolutionContext['mainFields'];
    originModulePath: ResolutionContext['originModulePath'];
  }>,
  modulePath: string,
): string | false;
/**
 * Get the mapped replacement for the given subpath defined by matching
 * `mainFields` entries in the passed `package.json`
 * (https://github.com/defunctzombie/package-browser-field-spec#replace-specific-files---advanced).
 *
 * Returns either:
 * - A `string` with the matched replacement subpath.
 * - `false`, indicating the module should be ignored.
 * - `null` when there is no entry for the subpath.
 */
export declare function matchSubpathFromMainFields(
  subpath: string | ReadonlyArray<string>,
  pkg: PackageJson,
  mainFields: ReadonlyArray<string>,
): string | false | null;
