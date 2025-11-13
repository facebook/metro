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

import Package from './Package';
import AbstractDataPlugin from 'metro-file-map/private/plugins/AbstractDataPlugin';

type GetClosestPackageFn = (absoluteFilePath: string) => ?{
  packageJsonPath: string,
  packageRelativePath: string,
};

export class PackageCache extends AbstractDataPlugin<PackageJson> {
  _getClosestPackage: GetClosestPackageFn;
  _packageCache: {
    [filePath: string]: Package,
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
    super({
      name: 'package-cache',
      workerParams: {
        workerModulePath: require.resolve('./lib/packageJsonWorker'),
        workerSetupArgs: {},
        filter: filePath => filePath.endsWith('package.json'),
      },
    });
    this._getClosestPackage = options.getClosestPackage;
    this._packageCache = Object.create(null);
    this._packagePathAndSubpathByModulePath = Object.create(null);
    this._modulePathsByPackagePath = Object.create(null);
  }

  getPackage(filePath: string): Package {
    if (!this._packageCache[filePath]) {
      this._packageCache[filePath] = new Package({
        file: filePath,
        readAndParse: () => {
          const result = this.lookup(filePath);
          if (result.exists == false || result.type !== 'f') {
            throw new Error('missing');
          }
          // In lazy mode, we haven't read the file yet.
          if (typeof result.pluginData === 'undefined') {
            return this.processFile(filePath);
          }
          return result.pluginData;
        },
      });
    }
    return this._packageCache[filePath];
  }

  getCacheKey(): string {
    return 'package-cache-1';
  }

  getPackageOf(
    absoluteModulePath: string,
  ): ?{pkg: Package, packageRelativePath: string} {
    let packagePathAndSubpath =
      this._packagePathAndSubpathByModulePath[absoluteModulePath];
    if (
      packagePathAndSubpath &&
      this._packageCache[packagePathAndSubpath.packageJsonPath]
    ) {
      return {
        pkg: this._packageCache[packagePathAndSubpath.packageJsonPath],
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

    return {
      pkg: this.getPackage(packagePath),
      packageRelativePath: packagePathAndSubpath.packageRelativePath,
    };
  }

  invalidate(filePath: string) {
    if (this._packageCache[filePath]) {
      this._packageCache[filePath].invalidate();
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
