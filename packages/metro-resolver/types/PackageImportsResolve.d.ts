/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<e23956477d8d1e5fef52de8eea8f091f>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/PackageImportsResolve.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {ExportsLikeMap, FileResolution, ResolutionContext} from './types';
/**
 * Resolve a package subpath based on the entry points defined in the package's
 * "imports" field. If there is no match for the given subpath (which may be
 * augmented by resolution of conditional exports for the passed `context`),
 * throws a `PackagePathNotExportedError`.
 *
 * Implementation of PACKAGE_IMPORTS_RESOLVE described in https://nodejs.org/api/esm.html
 *
 * @throws {InvalidPackageConfigurationError} Raised if configuration specified
 *   by `importsMap` is invalid.
 */
export declare function resolvePackageTargetFromImports(
  context: ResolutionContext,
  packagePath: string,
  importPath: string,
  importsMap: ExportsLikeMap,
  platform: string | null,
): FileResolution;
