/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {PackageInfo, ResolutionContext} from './types';
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
