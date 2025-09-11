/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
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
