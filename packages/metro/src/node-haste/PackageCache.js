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

import {readFileSync} from 'fs';
import {dirname} from 'path';

type GetClosestPackageFn = (absoluteFilePath: string) => ?{
  packageJsonPath: string,
  packageRelativePath: string,
};

export class PackageCache {
  _getClosestPackage: GetClosestPackageFn;
  _packageCache: {
    [filePath: string]: {
      rootPath: string,
      packageJson: PackageJson,
    },
    __proto__: null,
    ...
  };
  // Cache for "closest package.json" queries by module path.
  _packagePathAndSubpathByModulePath: {
    [filePath: string]: ?{
      packageJsonPath: string,
      packageRelativePath: string,
    },
    __proto__: null,
    ...
  };
  // The inverse of _packagePathByModulePath.
  _modulePathsByPackagePath: {
    [filePath: string]: Set<string>,
    __proto__: null,
    ...
  };

  constructor(options: {getClosestPackage: GetClosestPackageFn, ...}) {
    this._getClosestPackage = options.getClosestPackage;
    this._packageCache = Object.create(null);
    this._packagePathAndSubpathByModulePath = Object.create(null);
    this._modulePathsByPackagePath = Object.create(null);
  }

  getPackage(filePath: string): {
    rootPath: string,
    packageJson: PackageJson,
  } {
    if (!this._packageCache[filePath]) {
      this._packageCache[filePath] = {
        rootPath: dirname(filePath),
        packageJson: JSON.parse(readFileSync(filePath, 'utf8')),
      };
    }
    return this._packageCache[filePath];
  }

  getPackageForModule(absoluteModulePath: string): ?{
    packageJson: PackageJson,
    rootPath: string,
    packageRelativePath: string,
  } {
    let packagePathAndSubpath =
      this._packagePathAndSubpathByModulePath[absoluteModulePath];
    if (
      packagePathAndSubpath &&
      this._packageCache[packagePathAndSubpath.packageJsonPath]
    ) {
      const {rootPath, packageJson} =
        this._packageCache[packagePathAndSubpath.packageJsonPath];
      return {
        packageJson,
        rootPath,
        packageRelativePath: packagePathAndSubpath.packageRelativePath,
      };
    }

    packagePathAndSubpath = this._getClosestPackage(absoluteModulePath);
    if (!packagePathAndSubpath) {
      return null;
    }

    const packagePath = packagePathAndSubpath.packageJsonPath;

    this._packagePathAndSubpathByModulePath[absoluteModulePath] =
      packagePathAndSubpath;
    const modulePaths =
      this._modulePathsByPackagePath[packagePath] ?? new Set();
    modulePaths.add(absoluteModulePath);
    this._modulePathsByPackagePath[packagePath] = modulePaths;

    const pkg = this.getPackage(packagePath);

    if (pkg == null) {
      return null;
    }

    const {rootPath, packageJson} = pkg;

    return {
      packageJson,
      packageRelativePath: packagePathAndSubpath.packageRelativePath,
      rootPath,
    };
  }

  invalidate(filePath: string) {
    if (this._packageCache[filePath]) {
      delete this._packageCache[filePath];
    }
    const packagePathAndSubpath =
      this._packagePathAndSubpathByModulePath[filePath];
    if (packagePathAndSubpath) {
      // filePath is a module inside a package.
      const packagePath = packagePathAndSubpath.packageJsonPath;
      delete this._packagePathAndSubpathByModulePath[filePath];
      // This change doesn't invalidate any cached "closest package.json"
      // queries for the package's other modules. Clean up only this module.
      const modulePaths = this._modulePathsByPackagePath[packagePath];
      if (modulePaths) {
        modulePaths.delete(filePath);
        if (modulePaths.size === 0) {
          delete this._modulePathsByPackagePath[packagePath];
        }
      }
    }
    if (this._modulePathsByPackagePath[filePath]) {
      // filePath is a package. This change invalidates all cached "closest
      // package.json" queries for modules inside this package.
      const modulePaths = this._modulePathsByPackagePath[filePath];
      for (const modulePath of modulePaths) {
        delete this._packagePathAndSubpathByModulePath[modulePath];
      }
      modulePaths.clear();
      delete this._modulePathsByPackagePath[filePath];
    }
  }
}
