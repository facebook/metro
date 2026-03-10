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

import type {InvalidationData} from 'metro-file-map';

import Package from './Package';

type GetClosestPackageFn = (
  absoluteFilePath: string,
  invalidatedBy: ?InvalidationData,
) => ?{
  packageJsonPath: string,
  packageRelativePath: string,
};

export class PackageCache {
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
      // Canonical paths observed during hierarchicalLookup. Stored so they
      // can be replayed into the caller's InvalidationData on a cache hit.
      storedInvalidatedBy: ?InvalidationData,
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

  getPackage(filePath: string): Package {
    if (!this._packageCache[filePath]) {
      this._packageCache[filePath] = new Package({
        file: filePath,
      });
    }
    return this._packageCache[filePath];
  }

  getPackageOf(
    absoluteModulePath: string,
    invalidatedBy?: ?InvalidationData,
  ): ?{pkg: Package, packageRelativePath: string} {
    const cached = this._packagePathAndSubpathByModulePath[absoluteModulePath];
    if (cached && this._packageCache[cached.packageJsonPath]) {
      // Cache hit: replay stored invalidation paths into the caller's sets.
      if (invalidatedBy != null) {
        const stored = cached.storedInvalidatedBy;
        if (stored != null) {
          for (const p of stored.existence) {
            invalidatedBy.existence.add(p);
          }
          for (const p of stored.modification) {
            invalidatedBy.modification.add(p);
          }
        } else {
          // No stored paths (previous caller was not tracking). Re-run
          // hierarchicalLookup to collect them, then store for future hits.
          const freshInvalidatedBy = {
            existence: new Set<string>(),
            modification: new Set<string>(),
            haste: new Set<string>(),
          };
          this._getClosestPackage(absoluteModulePath, freshInvalidatedBy);
          cached.storedInvalidatedBy = freshInvalidatedBy;
          for (const p of freshInvalidatedBy.existence) {
            invalidatedBy.existence.add(p);
          }
          for (const p of freshInvalidatedBy.modification) {
            invalidatedBy.modification.add(p);
          }
        }
      }
      return {
        pkg: this._packageCache[cached.packageJsonPath],
        packageRelativePath: cached.packageRelativePath,
      };
    }

    // Cache miss: allocate fresh InvalidationData so we don't store the
    // caller's pre-existing paths in the cache.
    const isTracking = invalidatedBy != null;
    let freshInvalidatedBy: ?InvalidationData = null;
    if (isTracking) {
      freshInvalidatedBy = {
        existence: new Set<string>(),
        modification: new Set<string>(),
        haste: new Set<string>(),
      };
    }
    const closestPackage = this._getClosestPackage(
      absoluteModulePath,
      freshInvalidatedBy,
    );
    if (!closestPackage) {
      return null;
    }

    // Copy fresh paths into the caller's sets.
    if (invalidatedBy != null && freshInvalidatedBy != null) {
      for (const p of freshInvalidatedBy.existence) {
        invalidatedBy.existence.add(p);
      }
      for (const p of freshInvalidatedBy.modification) {
        invalidatedBy.modification.add(p);
      }
    }

    const packagePath = closestPackage.packageJsonPath;

    this._packagePathAndSubpathByModulePath[absoluteModulePath] = {
      ...closestPackage,
      storedInvalidatedBy: freshInvalidatedBy,
    };
    const modulePaths =
      this._modulePathsByPackagePath[packagePath] ?? new Set();
    modulePaths.add(absoluteModulePath);
    this._modulePathsByPackagePath[packagePath] = modulePaths;

    return {
      pkg: this.getPackage(packagePath),
      packageRelativePath: closestPackage.packageRelativePath,
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
