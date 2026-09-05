/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {PackageJson} from 'metro-resolver/private/types';

import {readFileSync} from 'node:fs';
import {dirname} from 'node:path';

type ReadPackageJsonFn = (absolutePackageJsonPath: string) => PackageJson;

const readPackageJsonSync: ReadPackageJsonFn = absolutePackageJsonPath =>
  JSON.parse(readFileSync(absolutePackageJsonPath, 'utf8'));

export type Package = Readonly<{
  rootPath: string,
  packageJson: PackageJson,
}>;

/**
 * Memoizes the parsed contents of `package.json` files by path. Which
 * package.json applies to a given module is the file map's concern (see
 * `PackageJsonPlugin`); this cache only avoids re-reading and re-parsing
 * manifests between changes.
 */
export class PackageCache {
  #readPackageJson: ReadPackageJsonFn;
  #packageCache: Map<string, Package> = new Map();

  constructor(options?: {readPackageJson?: ReadPackageJsonFn, ...}) {
    this.#readPackageJson = options?.readPackageJson ?? readPackageJsonSync;
  }

  getPackage(packageJsonPath: string): Package {
    let cached = this.#packageCache.get(packageJsonPath);
    if (cached == null) {
      cached = {
        rootPath: dirname(packageJsonPath),
        packageJson: this.#readPackageJson(packageJsonPath),
      };
      this.#packageCache.set(packageJsonPath, cached);
    }
    return cached;
  }

  invalidate(packageJsonPath: string): void {
    this.#packageCache.delete(packageJsonPath);
  }
}
