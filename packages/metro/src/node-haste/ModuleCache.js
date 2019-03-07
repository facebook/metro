/**
 * Copyright (c) Facebook, Inc. and its affiliates.
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

import type {PackageContent} from './Package';

type GetClosestPackageFn = (filePath: string) => ?string;

class ModuleCache {
  _getClosestPackage: GetClosestPackageFn;
  _moduleCache: {[filePath: string]: Module, __proto__: null};
  _packageCache: {[filePath: string]: Package, __proto__: null};
  _packagesById: {[id: string]: Package, __proto__: null};
  _packageModuleMap: WeakMap<Module, string>;

  constructor(options: {getClosestPackage: GetClosestPackageFn}) {
    this._getClosestPackage = options.getClosestPackage;
    this._moduleCache = Object.create(null);
    this._packageCache = Object.create(null);
    this._packagesById = Object.create(null);
    this._packageModuleMap = new WeakMap();
  }

  getModule(filePath: string) {
    if (!this._moduleCache[filePath]) {
      this._moduleCache[filePath] = new Module(filePath, this);
    }
    return this._moduleCache[filePath];
  }

  getPackage(filePath: string): Package {
    const cachedPackage = this._packageCache[filePath];
    if (!cachedPackage) {
      const newPackage = new Package({
        file: filePath,
      });
      const packageId = getPackageId(newPackage.read());
      return (this._packageCache[filePath] =
        this._packagesById[packageId] ||
        (this._packagesById[packageId] = newPackage));
    }
    return cachedPackage;
  }

  getPackageForModule(module: Module): ?Package {
    let packagePath = this._packageModuleMap.get(module);
    if (packagePath) {
      if (this._packageCache[packagePath]) {
        return this._packageCache[packagePath];
      } else {
        this._packageModuleMap.delete(module);
      }
    }

    packagePath = this._getClosestPackage(module.path);
    if (!packagePath) {
      return null;
    }

    const pack = this.getPackage(packagePath);
    this._packageModuleMap.set(module, pack.path);
    return pack;
  }

  processFileChange(type: string, filePath: string) {
    if (this._moduleCache[filePath]) {
      this._moduleCache[filePath].invalidate();
      delete this._moduleCache[filePath];
    }
    const pack = this._packageCache[filePath];
    if (pack) {
      if (pack.content) {
        const packageId = getPackageId(pack.content);
        delete this._packagesById[packageId];
      }
      pack.invalidate();
      delete this._packageCache[filePath];
    }
  }
}

function getPackageId(content: PackageContent) {
  return content.name + '@' + content.version;
}

module.exports = ModuleCache;
