/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import type {PackageJson} from 'metro-resolver/private/types';

import {readFileSync} from 'node:fs';
import {dirname} from 'node:path';

type GetClosestPackageFn = (absoluteFilePath: string) => ?Readonly<{
  packageJsonPath: string,
  packageRelativePath: string,
  ...
}>;

type ReadPackageJsonFn = (absolutePackageJsonPath: string) => PackageJson;

const readPackageJsonSync: ReadPackageJsonFn = absolutePackageJsonPath =>
  JSON.parse(readFileSync(absolutePackageJsonPath, 'utf8'));

type PackageForModule = Readonly<{
  packageJson: PackageJson,
  rootPath: string,
  packageRelativePath: string,
}>;

export class PackageCache {
  #getClosestPackage: GetClosestPackageFn;
  #readPackageJson: ReadPackageJsonFn;
  #packageCache: Map<
    string,
    {
      rootPath: string,
      packageJson: PackageJson,
    },
  >;
  // Module path → pre-built result object, or null (no allocation on hit)
  #resultByModulePath: Map<string, PackageForModule | null>;

  constructor(options: {
    getClosestPackage: GetClosestPackageFn,
    readPackageJson?: ReadPackageJsonFn,
    ...
  }) {
    this.#getClosestPackage = options.getClosestPackage;
    this.#readPackageJson = options.readPackageJson ?? readPackageJsonSync;
    this.#packageCache = new Map();
    this.#resultByModulePath = new Map();
  }

  getPackage(filePath: string): Readonly<{
    rootPath: string,
    packageJson: PackageJson,
  }> {
    let cached = this.#packageCache.get(filePath);
    if (cached == null) {
      cached = {
        rootPath: dirname(filePath),
        packageJson: this.#readPackageJson(filePath),
      };
      this.#packageCache.set(filePath, cached);
    }
    return cached;
  }

  getPackageForModule(absoluteModulePath: string): ?PackageForModule {
    const cached = this.#resultByModulePath.get(absoluteModulePath);

    // Distinguish between `null` (positively no closest package) and
    // `undefined` (no cached result yet)
    // eslint-disable-next-line lint/strictly-null
    if (cached !== undefined) {
      return cached;
    }

    const closest = this.#getClosestPackage(absoluteModulePath);
    if (closest == null) {
      this.#resultByModulePath.set(absoluteModulePath, null);
      return null;
    }

    const pkg = this.getPackage(closest.packageJsonPath);
    const result: PackageForModule = {
      packageJson: pkg.packageJson,
      packageRelativePath: closest.packageRelativePath,
      rootPath: pkg.rootPath,
    };
    this.#resultByModulePath.set(absoluteModulePath, result);
    return result;
  }

  /**
   * Invalidate for a changed `package.json` or symlink: forgets the parsed
   * contents of a `package.json`, and which package every module belongs to.
   * That depends only on the set of `package.json` files, their contents and
   * the real path of every directory above the module, so no other change
   * can affect it.
   */
  invalidate(filePath: string) {
    this.#packageCache.delete(filePath);
    this.#resultByModulePath.clear();
  }
}
