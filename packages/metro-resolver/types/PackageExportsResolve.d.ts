/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<7490133a41b70c6a0855b73fd990a5e3>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/PackageExportsResolve.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {ExportsField, FileResolution, ResolutionContext} from './types';
/**
 * Resolve a package subpath based on the entry points defined in the package's
 * "exports" field. If there is no match for the given subpath (which may be
 * augmented by resolution of conditional exports for the passed `context`),
 * throws a `PackagePathNotExportedError`.
 *
 * Implements modern package resolution behaviour based on the [Package Entry
 * Points spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points).
 *
 * @throws {InvalidPackageConfigurationError} Raised if configuration specified
 *   by `exportsField` is invalid.
 * @throws {InvalidModuleSpecifierError} Raised if the resolved module specifier
 *   is invalid.
 * @throws {PackagePathNotExportedError} Raised when the requested subpath is
 *   not exported.
 */
export declare function resolvePackageTargetFromExports(
  context: ResolutionContext,
  packagePath: string,
  modulePath: string,
  packageRelativePath: string,
  exportsField: ExportsField,
  platform: string | null,
): FileResolution;
