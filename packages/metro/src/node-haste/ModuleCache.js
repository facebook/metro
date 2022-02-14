/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const Module = require('./Module');
const Package = require('./Package');

type GetClosestPackageFn = (filePath: string) => ?string;

class ModuleCache {
  _getClosestPackage: GetClosestPackageFn;
  _moduleCache: {
    [filePath: string]: Module,
    __proto__: null,
    ...
  };
  _packageCache: {
    [filePath: string]: Package,
    __proto__: null,
    ...
  };
  // Cache for "closest package.json" queries by module path.
  _packagePathByModulePath: {
    [filePath: string]: string,
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
    this._moduleCache = Object.create(null);
    this._packageCache = Object.create(null);
    this._packagePathByModulePath = Object.create(null);
    this._modulePathsByPackagePath = Object.create(null);
  }

  getModule(filePath: string): Module {
    if (!this._moduleCache[filePath]) {
      this._moduleCache[filePath] = new Module(filePath, this);
    }
    return this._moduleCache[filePath];
  }

  getPackage(filePath: string): Package {
    if (!this._packageCache[filePath]) {
      this._packageCache[filePath] = new Package({
        file: filePath,
      });
    }
    return this._packageCache[filePath];
  }

  getPackageForModule(module: Module): ?Package {
    return this.getPackageOf(module.path);
  }

  getPackageOf(modulePath: string): ?Package {
    let packagePath = this._packagePathByModulePath[modulePath];
    if (packagePath && this._packageCache[packagePath]) {
      return this._packageCache[packagePath];
    }

    packagePath = this._getClosestPackage(modulePath);
    if (!packagePath) {
      return null;
    }

    this._packagePathByModulePath[modulePath] = packagePath;
    const modulePaths =
      this._modulePathsByPackagePath[packagePath] ?? new Set();
    modulePaths.add(modulePath);
    this._modulePathsByPackagePath[packagePath] = modulePaths;

    return this.getPackage(packagePath);
  }

  processFileChange(type: string, filePath: string) {
    if (this._moduleCache[filePath]) {
      this._moduleCache[filePath].invalidate();
      delete this._moduleCache[filePath];
    }
    if (this._packageCache[filePath]) {
      this._packageCache[filePath].invalidate();
      delete this._packageCache[filePath];
    }
    if (this._packagePathByModulePath[filePath]) {
      // filePath is a module inside a package.
      const packagePath = this._packagePathByModulePath[filePath];
      delete this._packagePathByModulePath[filePath];
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
        delete this._packagePathByModulePath[modulePath];
      }
      modulePaths.clear();
      delete this._modulePathsByPackagePath[filePath];
    }
  }
}

module.exports = ModuleCache;
